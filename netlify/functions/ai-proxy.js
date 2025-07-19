/**
 * @file Production-ready AI proxy with timeout optimization and async fallback
 * @version 4.2.0
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');
const Redis = require('ioredis');

// ================ Configuration ================
const CONFIG = {
    MAX_INPUT_LENGTH: 1500,
    MAX_OUTPUT_LENGTH: 5000,
    TIMEOUT_MS: 8500,        // 8.5 seconds
    CONNECT_TIMEOUT_MS: 3000, // 3 seconds
    MAX_RETRIES: 1,
    RATE_LIMIT: 8,
    GLOBAL_RATE_LIMIT: 100,
    RATE_WINDOW_MS: 60000,
    CACHE_TTL_SECONDS: 300,   // 5 minute cache
    CIRCUIT_BREAKER_THRESHOLD: 3,
    CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
    DEFAULT_PROVIDER: 'auto',
    DEFAULT_TEMP: 0.7,
    ASYNC_MODE: false,        // Disabled - not compatible with Netlify Functions
    ASYNC_WAIT_MS: 2000,      // Unused - kept for compatibility
    ASYNC_TOKEN_LIMIT: 1024   // Unused - kept for compatibility
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

// Pre-warm the Gemini client
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const geminiModel = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;
if (!geminiModel) {
    logger.warn('Gemini client not initialized. Check GEMINI_API_KEY environment variable.');
}

// ================ Rate Limiter ================
const rateLimiter = {
    inMemoryStore: new Map(),
    check: async (ip) => {
        if (redisClient) {
            // Use pipeline for better performance
            const pipeline = redisClient.pipeline();
            pipeline.incr('rate_limit:global');
            pipeline.expire('rate_limit:global', 60);
            pipeline.incr(`rate_limit:${ip}`);
            pipeline.expire(`rate_limit:${ip}`, Math.ceil(CONFIG.RATE_WINDOW_MS / 1000));
            
            const results = await pipeline.exec();
            const globalCount = results[0][1];
            const ipCount = results[2][1];

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
            
            // Clean up old entries to prevent memory leaks
            if (rateLimiter.inMemoryStore.size > 1000) {
                for (const [key, timestamps] of rateLimiter.inMemoryStore) {
                    const validTimestamps = timestamps.filter(t => t > windowStart);
                    if (validTimestamps.length === 0) {
                        rateLimiter.inMemoryStore.delete(key);
                    }
                }
            }
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
    const missingVars = requiredEnvVars.filter(env => !process.env[env]);
    
    if (missingVars.length > 0) {
        throw new ApiError(`Configuration error: Missing environment variables: ${missingVars.join(', ')}.`, 500);
    }
    
    logger.info('Environment validation passed', { 
        availableVars: requiredEnvVars.map(v => ({ [v]: !!process.env[v] }))
    });
}

// ================ Async Response System ================
const asyncResponseManager = {
    init: () => {
        if (!redisClient) return;
        
        // Note: Removed setInterval cleaner - not suitable for serverless
        // Redis TTL will handle cleanup automatically
        logger.info('Async response manager initialized - relying on Redis TTL for cleanup');
    },
    
    storeResponse: async (requestId, data) => {
        if (!redisClient) return false;
        try {
            await redisClient.setex(
                `async_response:${requestId}`, 
                300, // 5 minute TTL
                JSON.stringify({
                    ...data,
                    timestamp: Date.now()
                })
            );
            return true;
        } catch (error) {
            logger.error('Failed to store async response', error);
            return false;
        }
    },
    
    getResponse: async (requestId) => {
        if (!redisClient) return null;
        try {
            const data = await redisClient.get(`async_response:${requestId}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Failed to get async response', error);
            return null;
        }
    }
};

// Note: Async system disabled for Netlify compatibility
// if (redisClient) asyncResponseManager.init();

// ================ Timeout Helper Function ================
const promiseWithTimeout = (promise, timeoutMs, connectTimeoutMs) => {
    return new Promise((resolve, reject) => {
        const connectTimer = setTimeout(() => {
            clearTimeout(overallTimer);
            reject(new TimeoutError(`Connection timed out after ${connectTimeoutMs}ms`));
        }, connectTimeoutMs);

        const overallTimer = setTimeout(() => {
            clearTimeout(connectTimer);
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

// ================ API Provider Implementations ================
const geminiBreaker = createCircuitBreaker();
const deepseekBreaker = createCircuitBreaker();

async function callGemini(prompt, temperature, tokenLimit = 768) {
    return geminiBreaker(async () => {
        if (!geminiModel) throw new ApiError('Gemini client not initialized.', 500);
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
        
        try {
            const result = await geminiModel.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { 
                    temperature: clamp(temperature, 0.1, 1.0), 
                    maxOutputTokens: tokenLimit
                },
                signal: controller.signal
            });
            
            const response = await result.response;
            const text = await response.text(); // Ensure we await this
            return validateAndFormatApiResponse(text);
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new TimeoutError('Gemini request timed out');
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    });
}

async function callDeepSeek(prompt, temperature, tokenLimit = 768) {
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
                    max_tokens: tokenLimit,
                    stream: false
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
    // Create a stable cache key using hash instead of substring
    const crypto = require('crypto');
    const cacheKey = `auto_cache:${crypto.createHash('sha256').update(initialPrompt + temperature).digest('hex')}`;
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

    const rawResult = await callGemini(singleCallPrompt, temperature, CONFIG.ASYNC_TOKEN_LIMIT);
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
    gemini: (prompt, temp, tokenLimit = 768) => callGemini(prompt, temp, tokenLimit).then(text => ({ text })),
    deepseek: (prompt, temp, tokenLimit = 768) => callDeepSeek(prompt, temp, tokenLimit).then(text => ({ text })),
    auto: (prompt, temp) => handleAutoMode(prompt, temp),
};

// ================ Initial Validation ================
// Fail fast on startup if environment is invalid
validateEnvironment();

// ================ Main Handler ================
exports.handler = async (event) => {
    // Health Check Route
    if (event.path.endsWith('/health')) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'ok',
                version: '4.2.0',
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
        const { provider = CONFIG.DEFAULT_PROVIDER, prompt, temperature = CONFIG.DEFAULT_TEMP, requestId } = body;
        context.provider = provider;
        
        // Validate required fields
        if (!prompt) throw new ValidationError('Prompt is required');
        if (!Object.keys(apiProviders).includes(provider)) {
            throw new ValidationError(`Invalid provider. Available: ${Object.keys(apiProviders).join(', ')}`);
        }

        // Note: Async response polling disabled - not compatible with Netlify Functions
        if (requestId) {
            throw new ApiError('Async processing not supported in this deployment', 400);
        }

        const cleanPrompt = validateAndSanitizeInput(prompt);
        const safeTemp = clamp(temperature, 0.1, 1.0);

        const providerFunction = apiProviders[provider];
        
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
            headers: { 
                'Content-Type': 'application/json',
                'X-RateLimit-Limit': CONFIG.RATE_LIMIT.toString(),
                'X-RateLimit-Window': (CONFIG.RATE_WINDOW_MS / 1000).toString()
            },
            body: JSON.stringify({ 
                provider, 
                ...result, 
                metrics: { 
                    duration: context.duration, 
                    requestId: context.requestId,
                    timestamp: new Date().toISOString()
                } 
            })
        };

    } catch (error) {
        context.duration = Date.now() - startTime;
        context.errorType = error.name;
        context.errorMessage = error.message;
        
        logger.error(error, context);
        
        // Note: Async fallback removed - not compatible with Netlify Functions
        // Background processing is terminated when function returns response
        
        const statusCode = error instanceof ApiError ? error.statusCode : 500;
        const message = error instanceof ApiError ? error.message : 'An internal server error occurred.';
        
        return {
            statusCode,
            headers: { 
                'Content-Type': 'application/json',
                'X-RateLimit-Limit': CONFIG.RATE_LIMIT.toString(),
                'X-RateLimit-Window': (CONFIG.RATE_WINDOW_MS / 1000).toString()
            },
            body: JSON.stringify({ 
                error: { 
                    type: error.name || 'InternalError', 
                    message, 
                    requestId: context.requestId,
                    timestamp: new Date().toISOString()
                } 
            })
        };
    }
};

// ================ Global Error Handlers ================
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception thrown:', error);
    process.exit(1);
});