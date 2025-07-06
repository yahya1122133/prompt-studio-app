/**
 * @file This serverless function acts as a secure, rate-limited, and resilient proxy for various AI model providers.
 * @author Gemini
 * @version 4.1.0
 *
 * This version is optimized for Netlify's 10-second limit and includes production-grade
 * features like global rate limiting, response caching, a health check endpoint, and pre-warmed connections.
 * 
 * Changes in 4.1.0:
 * - Reduced timeout thresholds to avoid Netlify's 10s limit
 * - Added separate connection timeout for upstream APIs
 * - Enhanced circuit breaker with state logging
 * - Added AbortController for fetch requests
 * - Improved error logging with network diagnostics
 */

// ================ Dependencies ================
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');
const Redis = require('ioredis');

// ================ Configuration (Netlify Free Tier Optimized) ================
/**
 * Central configuration object for the function.
 */
const CONFIG = {
    MAX_INPUT_LENGTH: 1500,
    MAX_OUTPUT_LENGTH: 5000,
    TIMEOUT_MS: 7900,        // Reduced from 8500 to 7900 (7.9s)
    CONNECT_TIMEOUT_MS: 3000, // Added connection timeout
    MAX_RETRIES: 1,
    RATE_LIMIT: 8,           // Per-IP limit
    GLOBAL_RATE_LIMIT: 100,  // Total requests per minute
    RATE_WINDOW_MS: 60000,
    CACHE_TTL_SECONDS: 30,   // Cache duration for 'auto' mode
    CIRCUIT_BREAKER_THRESHOLD: 3,
    CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
    DEFAULT_PROVIDER: 'auto',
    DEFAULT_TEMP: 0.7,
};

// ================ Custom Error Classes ================
class ApiError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
    }
}
class ValidationError extends ApiError { constructor(message) { super(message, 400); } }
class RateLimitError extends ApiError { constructor(message = 'Rate limit exceeded.') { super(message, 429); } }
class TimeoutError extends ApiError { constructor(message = 'The request timed out.') { super(message, 504); } }
class CircuitBreakerOpenError extends ApiError { constructor(message = 'Service is temporarily unavailable.') { super(message, 503); } }

// ================ Core Services ================

const logger = {
    info: (message, context = {}) => console.log(JSON.stringify({ level: 'INFO', timestamp: new Date().toISOString(), message, ...context })),
    warn: (message, context = {}) => console.warn(JSON.stringify({ level: 'WARN', timestamp: new Date().toISOString(), message, ...context })),
    error: (error, context = {}) => console.error(JSON.stringify({ level: 'ERROR', timestamp: new Date().toISOString(), message: error.message, name: error.name, stack: error.stack, ...context })),
};

const redisClient = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
if (redisClient) {
    redisClient.on('error', err => logger.error(new Error('Redis Client Error'), { redisError: err.message }));
    logger.info('Redis client configured.');
} else {
    logger.warn('Redis URL not found. Falling back to in-memory services.');
}

// Pre-warm the Gemini client for faster invocations
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const geminiModel = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;
if (!geminiModel) {
    logger.warn('Gemini client not initialized. Check GEMINI_API_KEY environment variable.');
}


const rateLimiter = {
    inMemoryStore: new Map(),
    check: async (ip) => {
        if (redisClient) {
            const [globalCount, ipCount] = await Promise.all([
                redisClient.incr('rate_limit:global'),
                redisClient.incr(`rate_limit:${ip}`)
            ]);

            if (globalCount === 1) await redisClient.expire('rate_limit:global', 60);
            if (ipCount === 1) await redisClient.expire(`rate_limit:${ip}`, Math.ceil(CONFIG.RATE_WINDOW_MS / 1000));

            if (globalCount > CONFIG.GLOBAL_RATE_LIMIT) {
                throw new RateLimitError('Global rate limit exceeded. Please try again later.');
            }
            if (ipCount > CONFIG.RATE_LIMIT) {
                throw new RateLimitError('Per-IP rate limit exceeded.');
            }
        } else {
            const now = Date.now();
            const windowStart = now - CONFIG.RATE_WINDOW_MS;
            const userRequests = (rateLimiter.inMemoryStore.get(ip) || []).filter(t => t > windowStart);
            if (userRequests.length >= CONFIG.RATE_LIMIT) {
                throw new RateLimitError();
            }
            userRequests.push(now);
            rateLimiter.inMemoryStore.set(ip, userRequests);
        }
    }
};

// ================ Resilience Patterns ================

const createCircuitBreaker = () => {
    const state = { 
        failures: 0, 
        lastFailure: 0, 
        isOpen: false,
        lastStateChange: Date.now()
    };
    
    const logStateChange = (newState) => {
        logger.info(`Circuit breaker state changed to ${newState}`, {
            failures: state.failures,
            lastFailure: new Date(state.lastFailure).toISOString(),
            durationOpen: state.isOpen ? Date.now() - state.lastFailure : null
        });
    };
    
    return async (fn) => {
        const now = Date.now();
        if (state.isOpen) {
            if (now - state.lastFailure > CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS) {
                state.isOpen = false;
                state.lastStateChange = now;
                logStateChange('half-open');
            } else {
                throw new CircuitBreakerOpenError();
            }
        }
        try {
            const result = await fn();
            if (state.failures > 0) {
                logStateChange('closed');
                state.failures = 0;
                state.lastStateChange = now;
            }
            return result;
        } catch (error) {
            state.failures++;
            state.lastFailure = now;
            if (state.failures >= CONFIG.CIRCUIT_BREAKER_THRESHOLD && !state.isOpen) {
                state.isOpen = true;
                state.lastStateChange = now;
                logStateChange('open');
            }
            throw error;
        }
    };
};

const withRetry = async (fn) => {
    for (let i = 0; i <= CONFIG.MAX_RETRIES; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === CONFIG.MAX_RETRIES || error instanceof CircuitBreakerOpenError || error instanceof ValidationError) {
                throw error;
            }
            logger.warn(`Attempt ${i + 1} failed. Retrying...`, { error: error.message });
            await new Promise(res => setTimeout(res, 1000 * (i + 1)));
        }
    }
};

// ================ Utility & Validation Functions ================
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
const smartTruncate = (text, maxLen) => text.length <= maxLen ? text : text.substring(0, text.lastIndexOf(' ', maxLen)) + '...';

const validateApiKey = (key, serviceName) => {
    if (!key || typeof key !== 'string' || key.length < 30) {
        throw new ApiError(`Missing or invalid API key for ${serviceName}.`, 500);
    }
};

const validateAndFormatApiResponse = (text) => {
    if (typeof text !== 'string') throw new ApiError('Invalid API response type from model provider.', 502);
    return text.length > CONFIG.MAX_OUTPUT_LENGTH ? smartTruncate(text, CONFIG.MAX_OUTPUT_LENGTH) : text;
};

const validateAndSanitizeInput = (input) => {
    if (typeof input !== 'string' || !input.trim()) throw new ValidationError('Prompt cannot be empty.');
    if (input.length > CONFIG.MAX_INPUT_LENGTH) throw new ValidationError(`Input exceeds ${CONFIG.MAX_INPUT_LENGTH} characters.`);
    return input.replace(/[<>&"']/g, '');
};

function validateEnvironment() {
    const requiredEnvVars = ['GEMINI_API_KEY', 'DEEPSEEK_API_KEY'];
    requiredEnvVars.forEach(env => {
        if (!process.env[env]) throw new ApiError(`Configuration error: Missing environment variable ${env}.`, 500);
    });
}

// ================ API Provider Implementations ================
const geminiBreaker = createCircuitBreaker();
const deepseekBreaker = createCircuitBreaker();

async function callGemini(prompt, temperature) {
    return geminiBreaker(async () => {
        if (!geminiModel) throw new ApiError('Gemini client not initialized.', 500);
        const result = await geminiModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: clamp(temperature, 0.1, 1.0), maxOutputTokens: 1024 }
        });
        const response = await result.response;
        return validateAndFormatApiResponse(response.text());
    });
}

async function callDeepSeek(prompt, temperature) {
    return deepseekBreaker(async () => {
        const apiKey = process.env.DEEPSEEK_API_KEY;
        validateApiKey(apiKey, 'DeepSeek');
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
        
        try {
            const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
                method: "POST",
                headers: { 
                    "Authorization": `Bearer ${apiKey}`, 
                    "Content-Type": "application/json" 
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [{ role: "user", content: prompt }],
                    temperature: clamp(temperature, 0.1, 1.0),
                    max_tokens: 1024
                }),
                signal: controller.signal
            });
            
            if (!response.ok) {
                const errorBody = await response.text();
                logger.error(`DeepSeek API error: ${response.status} - ${errorBody}`);
                throw new ApiError(`DeepSeek API error: ${response.status}`, 502);
            }
            
            const data = await response.json();
            if (!data.choices?.[0]?.message?.content) {
                throw new ApiError('Invalid response structure from DeepSeek API.', 502);
            }
            
            return validateAndFormatApiResponse(data.choices[0].message.content);
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new TimeoutError('DeepSeek API request timed out');
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    });
}

async function handleAutoMode(initialPrompt, temperature) {
    const cacheKey = `auto_cache:${initialPrompt.substring(0, 100)}:${temperature}`;
    if (redisClient) {
        const cachedResult = await redisClient.get(cacheKey);
        if (cachedResult) {
            logger.info("Serving 'auto' mode response from cache.", { cacheKey });
            return JSON.parse(cachedResult);
        }
    }

    const singleCallPrompt = `
        You are an expert prompt engineer. Your task is to analyze and improve a user's prompt in a single step.
        User's Prompt: "${initialPrompt}"
        Perform:
        1. **Analyze:** Critically evaluate for clarity, specificity, and ambiguities.
        2. **Improve:** Rewrite the prompt to be more effective.
        3. **Justify:** Briefly explain why the new prompt is better.
        Return a single JSON object with the keys "analysis", "justification", and "improvedPrompt". Do not return any other text.`;

    const rawResult = await callGemini(singleCallPrompt, temperature);
    let result;

    try {
        const parsedResult = JSON.parse(rawResult);
        result = {
            text: parsedResult.improvedPrompt || "Could not generate improved prompt.",
            diagnostics: {
                original: initialPrompt,
                analysis: parsedResult.analysis || "No analysis provided.",
                validation: parsedResult.justification || "No justification provided."
            }
        };
    } catch (e) {
        logger.warn("Auto mode response was not valid JSON. Falling back to raw text.", { rawResult });
        result = {
            text: rawResult,
            diagnostics: {
                original: initialPrompt,
                analysis: "Could not parse analysis from model response.",
                validation: "Could not parse justification from model response."
            }
        };
    }

    if (redisClient) {
        await redisClient.setex(cacheKey, CONFIG.CACHE_TTL_SECONDS, JSON.stringify(result));
    }
    return result;
}

const apiProviders = {
    gemini: (prompt, temp) => callGemini(prompt, temp).then(text => ({ text })),
    deepseek: (prompt, temp) => callDeepSeek(prompt, temp).then(text => ({ text })),
    auto: handleAutoMode,
};

// ================ Initial Validation ================
try {
    validateEnvironment();
} catch (e) {
    logger.error(e, { context: 'Initial environment validation failed.'});
}

// ================ Main Handler ================
exports.handler = async (event) => {
    // Health Check Route
    if (event.path.endsWith('/health')) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'ok',
                version: '4.1.0',
                timestamp: new Date().toISOString()
            })
        };
    }

    const context = {
        requestId: Math.random().toString(36).substring(2, 9),
        clientIP: event.headers['x-nf-client-connection-ip'] || 'unknown',
        cfRay: event.headers['cf-ray'] || 'none',
        userAgent: event.headers['user-agent'] || 'unknown',
        memoryUsage: process.memoryUsage()
    };
    const startTime = Date.now();

    try {
        if (event.httpMethod !== 'POST') throw new ApiError('Method Not Allowed', 405);
        await rateLimiter.check(context.clientIP);

        const body = JSON.parse(event.body || '{}');
        const { provider = CONFIG.DEFAULT_PROVIDER, prompt, temperature = CONFIG.DEFAULT_TEMP } = body;
        context.provider = provider;

        const cleanPrompt = validateAndSanitizeInput(prompt);
        const safeTemp = clamp(temperature, 0.1, 1.0);

        const providerFunction = apiProviders[provider];
        if (!providerFunction) throw new ValidationError(`Invalid provider. Available: ${Object.keys(apiProviders).join(', ')}`);

        const promiseToExecute = () => 
            promiseWithTimeout(
                providerFunction(cleanPrompt, safeTemp), 
                CONFIG.TIMEOUT_MS,
                CONFIG.CONNECT_TIMEOUT_MS
            );
            
        const result = await withRetry(promiseToExecute);
        
        context.duration = Date.now() - startTime;
        logger.info('Request successful', context);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, ...result, metrics: { duration: context.duration, requestId: context.requestId } })
        };

    } catch (error) {
        context.duration = Date.now() - startTime;
        context.errorType = error.name;
        context.errorMessage = error.message;
        
        logger.error(error, context);
        
        const statusCode = error instanceof ApiError ? error.statusCode : 500;
        const message = error instanceof ApiError ? error.message : 'An internal server error occurred.';
        
        return {
            statusCode,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: { 
                    type: error.name || 'InternalError', 
                    message, 
                    requestId: context.requestId 
                } 
            })
        };
    }
};

// ================ Timeout Helper Function ================
const promiseWithTimeout = (promise, timeoutMs, connectTimeoutMs) => {
    return new Promise((resolve, reject) => {
        const connectTimer = setTimeout(() => {
            reject(new TimeoutError(`Connection timed out after ${connectTimeoutMs}ms`));
        }, connectTimeoutMs);

        const overallTimer = setTimeout(() => {
            reject(new TimeoutError(`Request timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        promise
            .then(result => {
                clearTimeout(connectTimer);
                clearTimeout(overallTimer);
                resolve(result);
            })
            .catch(error => {
                clearTimeout(connectTimer);
                clearTimeout(overallTimer);
                reject(error);
            });
    });
};

// ================ Global Error Handlers ================
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception thrown:', error);
    process.exit(1);
});