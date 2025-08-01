/**
 * @file Production-ready AI proxy with streaming support, optimized for serverless environments.
 * @version 5.1.0
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');
const https = require('https');
const crypto = require('crypto');
const redis = require('redis');

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

// ================ Redis Initialization ================
let redisClient = null;
if (process.env.REDIS_URL) {
    redisClient = redis.createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => logger.error('Redis error', { error: err.message }));
    redisClient.connect().catch(err => logger.error('Redis connection failed', { error: err.message }));
} else {
    logger.warn('Redis disabled. Using in-memory fallbacks. Not suitable for production.');
}

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
class StreamingError extends ApiError { constructor(message = 'Streaming not supported in this environment.') { super(message, 501); } }

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

// ================ Async Stream Helper ================
async function* streamAsyncIterator(stream) {
    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) return;
            yield value;
        }
    } finally {
        reader.releaseLock();
    }
}

// ================ API Provider Implementations ================
const geminiBreaker = createCircuitBreaker('Gemini');
const deepseekBreaker = createCircuitBreaker('DeepSeek');

// Non-streaming implementations
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

// Streaming implementations
async function callGeminiStream(prompt, temperature, tokenLimit, context, stream) {
    if (!geminiModel) throw new ApiError('Gemini service unavailable', 503);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
    const start = Date.now();

    try {
        const streamingResp = await geminiModel.generateContentStream({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: clamp(temperature, 0.1, 1.0),
                maxOutputTokens: tokenLimit
            },
            signal: controller.signal
        });

        // Set SSE headers
        stream.setContentType('text/event-stream');
        stream.setHeader('Cache-Control', 'no-cache');
        stream.setHeader('Connection', 'keep-alive');

        // Convert Gemini stream to SSE format
        for await (const chunk of streamingResp.stream) {
            const text = chunk.text();
            if (text) {
                stream.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
        }

        logger.perf('gemini_stream_time', Date.now() - start, context);
    } catch (error) {
        if (error.name === 'AbortError') throw new TimeoutError('Gemini request timed out.');
        throw error;
    } finally {
        clearTimeout(timeout);
        stream.end();
    }
}

async function callDeepSeekStream(prompt, temperature, tokenLimit, context, stream) {
    if (!process.env.DEEPSEEK_API_KEY) throw new ApiError('DeepSeek service unavailable', 503);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
    const start = Date.now();

    try {
        const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "user", content: prompt }],
                temperature: clamp(temperature, 0.1, 1.0),
                max_tokens: tokenLimit,
                stream: true
            }),
            signal: controller.signal,
            agent: keepAliveAgent
        });

        if (!response.ok) {
            throw new ApiError(`DeepSeek API error: ${response.status}`, response.status);
        }

        // Set SSE headers
        stream.setContentType('text/event-stream');
        stream.setHeader('Cache-Control', 'no-cache');
        stream.setHeader('Connection', 'keep-alive');

        // Pipe the stream directly to client
        for await (const chunk of streamAsyncIterator(response.body)) {
            stream.write(chunk);
        }

        logger.perf('deepseek_stream_time', Date.now() - start, context);
    } catch (error) {
        if (error.name === 'AbortError') throw new TimeoutError('DeepSeek request timed out.');
        throw error;
    } finally {
        clearTimeout(timeout);
        stream.end();
    }
}

// Test provider implementations
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

async function callTestProviderStream(prompt, temperature, tokenLimit, context, stream) {
    const responses = [
        "This is a test streaming response.",
        "It simulates a real AI stream.",
        `Your prompt: "${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}"`,
        `Temperature: ${temperature}, Token limit: ${tokenLimit}`,
        "End of test stream."
    ];

    // Set SSE headers
    stream.setContentType('text/event-stream');
    stream.setHeader('Cache-Control', 'no-cache');
    stream.setHeader('Connection', 'keep-alive');

    for (const text of responses) {
        await new Promise(resolve => setTimeout(resolve, 300));
        stream.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    stream.end();
}

// Auto mode handlers
async function handleAutoMode(prompt, temperature, tokenLimit, context) {
    try {
        logger.info('Auto mode using Gemini', context);
        return await callGemini(prompt, temperature, tokenLimit, context);
    } catch (error) {
        logger.warn('Auto mode falling back to DeepSeek', { ...context, error: error.message });
        return await callDeepSeek(prompt, temperature, tokenLimit, context);
    }
}

async function handleAutoModeStream(prompt, temperature, tokenLimit, context, stream) {
    try {
        logger.info('Auto mode using Gemini (stream)', context);
        await callGeminiStream(prompt, temperature, tokenLimit, context, stream);
    } catch (error) {
        logger.warn('Auto mode falling back to DeepSeek (stream)', { ...context, error: error.message });
        await callDeepSeekStream(prompt, temperature, tokenLimit, context, stream);
    }
}

// Provider mappings
const apiProviders = {
    gemini: (prompt, temp, tokenLimit, ctx) => callGemini(prompt, temp, tokenLimit, ctx).then(text => ({ text })),
    deepseek: (prompt, temp, tokenLimit, ctx) => callDeepSeek(prompt, temp, tokenLimit, ctx).then(text => ({ text })),
    auto: (prompt, temp, tokenLimit, ctx) => handleAutoMode(prompt, temp, tokenLimit, ctx).then(text => ({ text })),
    test: (prompt, temp, tokenLimit, ctx) => callTestProvider(prompt, temp, tokenLimit, ctx).then(text => ({ text })),
};

const apiProvidersStream = {
    gemini: (prompt, temp, tokenLimit, ctx, stream) => 
        geminiBreaker(() => callGeminiStream(prompt, temp, tokenLimit, ctx, stream)),
    deepseek: (prompt, temp, tokenLimit, ctx, stream) => 
        deepseekBreaker(() => callDeepSeekStream(prompt, temp, tokenLimit, ctx, stream)),
    auto: (prompt, temp, tokenLimit, ctx, stream) => 
        handleAutoModeStream(prompt, temp, tokenLimit, ctx, stream),
    test: (prompt, temp, tokenLimit, ctx, stream) => 
        callTestProviderStream(prompt, temp, tokenLimit, ctx, stream)
};

// ================ Main Handler ================
exports.handler = async (event, context) => {
    // Health check endpoint
    if (event.path.endsWith('/health')) {
        return { statusCode: 200, body: JSON.stringify({ 
            status: 'ok', 
            version: '5.1.0',
            providers: {
                gemini: !!process.env.GEMINI_API_KEY,
                deepseek: !!process.env.DEEPSEEK_API_KEY,
                test: true,
                auto: true
            },
            features: {
                streaming: true
            }
        }) };
    }

    // Handle incorrect base path
    if (!event.path.startsWith(CONFIG.BASE_PATH)) {
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

    const reqContext = {
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
                        requestId: reqContext.requestId
                    }
                })
            };
        }

        await rateLimiter.check(reqContext.clientIP);

        const body = JSON.parse(event.body || '{}');
        const {
            provider = CONFIG.DEFAULT_PROVIDER,
            prompt,
            temperature = CONFIG.DEFAULT_TEMP,
            tokenLimit = CONFIG.DEFAULT_TOKEN_LIMIT,
            stream = false
        } = body;
        
        reqContext.provider = provider;
        reqContext.streaming = stream;
        
        if (!prompt) throw new ValidationError('Prompt is required');
        if (!apiProviders[provider]) throw new ValidationError(`Invalid provider. Available: ${Object.keys(apiProviders).join(', ')}`);

        // Handle streaming requests
        if (stream) {
            if (!event.serverlessStream) {
                throw new StreamingError();
            }

            // Validate provider availability
            if (provider === 'gemini' && !geminiModel) throw new ApiError('Gemini service unavailable', 503);
            if (provider === 'deepseek' && !process.env.DEEPSEEK_API_KEY) throw new ApiError('DeepSeek service unavailable', 503);
            
            const cleanPrompt = validateAndSanitizeInput(prompt);
            const safeTemp = clamp(temperature, 0.1, 1.0);
            const safeTokenLimit = clamp(tokenLimit, 64, 4096);

            const providerFn = apiProvidersStream[provider] || apiProvidersStream.auto;
            await providerFn(cleanPrompt, safeTemp, safeTokenLimit, reqContext, event.serverlessStream);
            
            logger.info('Streaming request completed', { ...reqContext });
            return;
        }

        // Non-streaming request handling
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
                logger.info('Serving from cache', { ...reqContext, cacheKey });
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
        const providerFunction = () => apiProviders[provider](cleanPrompt, safeTemp, safeTokenLimit, reqContext);
        const result = await withRetry(providerFunction, reqContext);
        const duration = Date.now() - startTime;

        // Prepare final response
        const responseData = JSON.stringify({
            provider,
            ...result,
            metrics: { 
                duration, 
                requestId: reqContext.requestId,
                retries: reqContext.retries || 0
            }
        });

        // Cache response
        if (redisClient && !result.error) {
            await redisClient.set(cacheKey, responseData, 'EX', CONFIG.CACHE_TTL_SECONDS);
        }

        logger.info('Request successful', { ...reqContext, duration, cacheKey });
        
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
        logger.error(error, { ...reqContext, duration });
        
        const statusCode = error instanceof ApiError ? error.statusCode : 500;
        const message = error instanceof ApiError ? error.message : 'An internal server error occurred.';

        // Handle streaming errors
        if (reqContext.streaming && event.serverlessStream) {
            event.serverlessStream.setContentType('application/json');
            event.serverlessStream.writeHead(statusCode);
            event.serverlessStream.end(JSON.stringify({
                error: { 
                    type: error.name || 'InternalError', 
                    message, 
                    requestId: reqContext.requestId 
                }
            }));
            return;
        }

        return {
            statusCode,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: { 
                    type: error.name || 'InternalError', 
                    message, 
                    requestId: reqContext.requestId 
                }
            })
        };
    }
};