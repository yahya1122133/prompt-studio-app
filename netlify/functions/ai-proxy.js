/**
 * @file Production-ready AI proxy, optimized for serverless environments.
 * @version 5.0.1
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');
const https = require('https');
const crypto = require('crypto');
// const redis = require('redis'); // Removed - not using Redis

// ================ Configuration ================
const CONFIG = {
    MAX_INPUT_LENGTH: 1500,
    MAX_OUTPUT_LENGTH: 5000,
    TIMEOUT_MS: 25000,
    MAX_RETRIES: 2,
    RATE_LIMIT: 15,
    RATE_WINDOW_MS: 60000,
    CACHE_TTL_SECONDS: 600,
    CIRCUIT_BREAKER_THRESHOLD: 3,
    CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
    DEFAULT_PROVIDER: 'auto',
    DEFAULT_TEMP: 0.7,
    DEFAULT_TOKEN_LIMIT: 1024,
    KEEP_ALIVE_SOCKETS: 25,
    // Add base path configuration
    BASE_PATH: process.env.BASE_PATH || '/.netlify/functions/ai-proxy'
};

// ================ Core Services ================
const logger = {
    info: (message, context = {}) => console.log(JSON.stringify({ level: 'INFO', timestamp: new Date().toISOString(), message, ...context })),
    warn: (message, context = {}) => console.warn(JSON.stringify({ level: 'WARN', timestamp: new Date().toISOString(), message, ...context })),
    error: (error, context = {}) => console.error(JSON.stringify({ level: 'ERROR', timestamp: new Date().toISOString(), message: error.message, name: error.name, stack: error.stack, ...context })),
    perf: (metric, value, context = {}) => console.log(JSON.stringify({ level: 'PERF', timestamp: new Date().toISOString(), metric, value, ...context }))
};

// ================ Keep-Alive Agent ================
const keepAliveAgent = new https.Agent({
    keepAlive: true,
    maxSockets: CONFIG.KEEP_ALIVE_SOCKETS,
    freeSocketTimeout: 30000,
});

// ================ Redis Removed ================
// Redis functionality removed - using in-memory fallbacks only
let redisClient = null;

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

// ================ Pre-warm AI Clients ================
let geminiModel = null;
if (process.env.GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        logger.info('Gemini client initialized');
    } catch (err) {
        logger.error('Gemini initialization failed', { error: err.message });
    }
}

// ================ Rate Limiter ================
const rateLimiter = {
    check: async (ip) => {
        if (redisClient) {
            const key = `rate_limit:${ip}`;
            const current = await redisClient.incr(key);
            if (current === 1) {
                await redisClient.expire(key, Math.ceil(CONFIG.RATE_WINDOW_MS / 1000));
            }
            if (current > CONFIG.RATE_LIMIT) {
                throw new RateLimitError();
            }
        } else {
            // In-memory fallback
            const now = Date.now();
            const key = `rate_limit:${ip}`;
            const windowStart = now - CONFIG.RATE_WINDOW_MS;
            
            if (!rateLimiter.inMemoryStore) {
                rateLimiter.inMemoryStore = new Map();
            }
            
            let requests = rateLimiter.inMemoryStore.get(key) || [];
            requests = requests.filter(t => t > windowStart);
            
            if (requests.length >= CONFIG.RATE_LIMIT) {
                throw new RateLimitError();
            }
            
            requests.push(now);
            rateLimiter.inMemoryStore.set(key, requests);
        }
    }
};

// ================ Resilience Patterns ================
const createCircuitBreaker = (serviceName) => {
    const state = { failures: 0, lastFailure: 0, isOpen: false };
    return async (fn) => {
        if (redisClient) {
            const redisKey = `breaker:${serviceName}`;
            const breakerState = await redisClient.get(redisKey);
            if (breakerState) {
                const { isOpen, lastFailure } = JSON.parse(breakerState);
                if (isOpen && Date.now() - lastFailure < CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS) {
                    throw new CircuitBreakerOpenError();
                }
            }
        } else if (state.isOpen) {
            if (Date.now() - state.lastFailure > CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS) {
                state.isOpen = false;
                logger.info(`Circuit breaker for ${serviceName} is now half-open.`);
            } else {
                throw new CircuitBreakerOpenError();
            }
        }

        try {
            const result = await fn();
            if (state.failures > 0 || (redisClient && state.isOpen)) {
                state.failures = 0;
                state.isOpen = false;
                logger.info(`Circuit breaker for ${serviceName} is now closed.`);
                if (redisClient) {
                    await redisClient.del(`breaker:${serviceName}`);
                }
            }
            return result;
        } catch (error) {
            state.failures++;
            state.lastFailure = Date.now();
            
            if (state.failures >= CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
                state.isOpen = true;
                logger.warn(`Circuit breaker for ${serviceName} is now open.`);
                if (redisClient) {
                    await redisClient.set(
                        `breaker:${serviceName}`,
                        JSON.stringify({ isOpen: true, lastFailure: state.lastFailure }),
                        'EX', Math.ceil(CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS / 1000)
                    );
                }
            }
            throw error;
        }
    };
};

const withRetry = async (fn, context) => {
    for (let i = 0; i <= CONFIG.MAX_RETRIES; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === CONFIG.MAX_RETRIES || 
                error instanceof CircuitBreakerOpenError || 
                error instanceof ValidationError) {
                throw error;
            }
            logger.warn(`Attempt ${i + 1} failed. Retrying...`, { ...context, error: error.message });
            await new Promise(res => setTimeout(res, 500 * Math.pow(2, i)));
        }
    }
};

// ================ Utility & Validation ================
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

const validateAndSanitizeInput = (input) => {
    if (typeof input !== 'string' || !input.trim()) throw new ValidationError('Prompt cannot be empty.');
    if (input.length > CONFIG.MAX_INPUT_LENGTH) throw new ValidationError(`Input exceeds ${CONFIG.MAX_INPUT_LENGTH} characters.`);
    return input;
};

const generateCacheKey = (provider, prompt, temp, tokenLimit) => {
    const hash = crypto.createHash('sha256').update(`${provider}:${prompt}:${temp}:${tokenLimit}`).digest('hex');
    return `cache:${hash}`;
};

// ================ API Provider Implementations ================
const geminiBreaker = createCircuitBreaker('Gemini');
const deepseekBreaker = createCircuitBreaker('DeepSeek');

async function callGemini(prompt, temperature, tokenLimit, context) {
    if (!geminiModel) throw new ApiError('Gemini service unavailable', 503);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
    const start = Date.now();

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
        const duration = Date.now() - start;
        logger.perf('gemini_response_time', duration, context);
        return response.text();
    } catch (error) {
        if (error.name === 'AbortError') throw new TimeoutError('Gemini request timed out.');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function callDeepSeek(prompt, temperature, tokenLimit, context) {
    if (!process.env.DEEPSEEK_API_KEY) throw new ApiError('DeepSeek service unavailable', 503);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
    const start = Date.now();

    try {
        const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                "Content-Type": "application/json",
                "Accept-Encoding": "gzip, deflate, br"
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "user", content: prompt }],
                temperature: clamp(temperature, 0.1, 1.0),
                max_tokens: tokenLimit,
                stream: false
            }),
            signal: controller.signal,
            agent: keepAliveAgent
        });

        if (!response.ok) {
            throw new ApiError(`DeepSeek API error: ${response.status}`, response.status);
        }

        const data = await response.json();
        if (!data.choices?.[0]?.message?.content) {
            throw new ApiError('Invalid response structure from DeepSeek API.', 502);
        }
        
        const duration = Date.now() - start;
        logger.perf('deepseek_response_time', duration, context);
        return data.choices[0].message.content;
    } catch (error) {
        if (error.name === 'AbortError') throw new TimeoutError('DeepSeek API request timed out.');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function handleAutoMode(prompt, temperature, tokenLimit, context) {
    try {
        logger.info('Auto mode using Gemini', context);
        return await callGemini(prompt, temperature, tokenLimit, context);
    } catch (error) {
        logger.warn('Auto mode falling back to DeepSeek', { ...context, error: error.message });
        return await callDeepSeek(prompt, temperature, tokenLimit, context);
    }
}

async function callTestProvider(prompt, temperature, tokenLimit, context) {
    // Simulate a realistic response time
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    const responses = [
        `Test response for: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`,
        `Mock AI response: This is a generated response using temp=${temperature} and maxTokens=${tokenLimit}.`,
        `Test Provider Response: Your prompt has been processed. This is a simulated response for testing purposes.`,
        `Demo Response: I understand you want "${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}". This is a test response.`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
}

const apiProviders = {
    gemini: (prompt, temp, tokenLimit, ctx) => callGemini(prompt, temp, tokenLimit, ctx).then(text => ({ text })),
    deepseek: (prompt, temp, tokenLimit, ctx) => callDeepSeek(prompt, temp, tokenLimit, ctx).then(text => ({ text })),
    auto: (prompt, temp, tokenLimit, ctx) => handleAutoMode(prompt, temp, tokenLimit, ctx).then(text => ({ text })),
    test: (prompt, temp, tokenLimit, ctx) => callTestProvider(prompt, temp, tokenLimit, ctx).then(text => ({ text })),
};

// ================ Main Handler ================
exports.handler = async (event) => {
    // Health check endpoint
    if (event.path.endsWith('/health')) {
        return { statusCode: 200, body: JSON.stringify({ 
            status: 'ok', 
            version: '5.0.1',
            providers: {
                gemini: !!process.env.GEMINI_API_KEY,
                deepseek: !!process.env.DEEPSEEK_API_KEY,
                test: true,
                auto: true
            }
        }) };
    }

    // Handle both /api/ai-proxy and /.netlify/functions/ai-proxy paths
    const isValidPath = event.path.startsWith(CONFIG.BASE_PATH) || 
                       event.path.startsWith('/api/ai-proxy') ||
                       event.path.includes('ai-proxy');
    
    if (!isValidPath) {
        return {
            statusCode: 404,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: {
                    type: 'NotFound',
                    message: `Endpoint not found. Use ${CONFIG.BASE_PATH} for API access.`,
                    validEndpoints: [
                        `${CONFIG.BASE_PATH}`,
                        `${CONFIG.BASE_PATH}/health`
                    ]
                }
            })
        };
    }

    const context = {
        requestId: crypto.randomBytes(8).toString('hex'),
        clientIP: event.headers['x-forwarded-for'] || event.headers['x-nf-client-connection-ip'] || 'unknown',
    };
    const startTime = Date.now();

    try {
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
                body: JSON.stringify({
                    error: {
                        type: 'MethodNotAllowed',
                        message: 'Only POST requests are supported',
                        requestId: context.requestId
                    }
                })
            };
        }

        await rateLimiter.check(context.clientIP);

        const body = JSON.parse(event.body || '{}');
        const {
            provider = CONFIG.DEFAULT_PROVIDER,
            prompt,
            temperature = CONFIG.DEFAULT_TEMP,
            tokenLimit = CONFIG.DEFAULT_TOKEN_LIMIT
        } = body;
        
        context.provider = provider;
        if (!prompt) throw new ValidationError('Prompt is required');
        if (!apiProviders[provider]) throw new ValidationError(`Invalid provider. Available: ${Object.keys(apiProviders).join(', ')}`);

        // Validate provider availability
        if (provider === 'gemini' && !geminiModel) throw new ApiError('Gemini service unavailable', 503);
        if (provider === 'deepseek' && !process.env.DEEPSEEK_API_KEY) throw new ApiError('DeepSeek service unavailable', 503);

        const cleanPrompt = validateAndSanitizeInput(prompt);
        const safeTemp = clamp(temperature, 0.1, 1.0);
        const safeTokenLimit = clamp(tokenLimit, 64, 4096);

        // Check response cache
        const cacheKey = generateCacheKey(provider, cleanPrompt, safeTemp, safeTokenLimit);
        if (redisClient) {
            const cachedResponse = await redisClient.get(cacheKey);
            if (cachedResponse) {
                logger.info('Serving from cache', { ...context, cacheKey });
                return {
                    statusCode: 200,
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Cache': 'HIT'
                    },
                    body: cachedResponse
                };
            }
        }

        // Process request
        const providerFunction = () => apiProviders[provider](cleanPrompt, safeTemp, safeTokenLimit, context);
        const result = await withRetry(providerFunction, context);
        const duration = Date.now() - startTime;

        // Prepare final response
        const responseData = JSON.stringify({
            provider,
            ...result,
            metrics: { 
                duration, 
                requestId: context.requestId,
                retries: context.retries || 0
            }
        });

        // Cache response
        if (redisClient && !result.error) {
            await redisClient.set(cacheKey, responseData, 'EX', CONFIG.CACHE_TTL_SECONDS);
        }

        logger.info('Request successful', { ...context, duration, cacheKey });
        
        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'X-Cache': 'MISS'
            },
            body: responseData
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(error, { ...context, duration });
        
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
