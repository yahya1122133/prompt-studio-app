const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');

// --- Robustness Helpers ---
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
const TIMEOUT_MS = 20000; // 20-second timeout

const sanitizeInput = (text) => 
  text.replace(/[<>&"']/g, '').substring(0, 2000);

const smartTruncate = (text, maxLen) => {
  if (text.length <= maxLen) return text;
  return text.substring(0, text.lastIndexOf(' ', maxLen)) + '...';
};

const promiseWithTimeout = (promise, ms) => {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
};

// --- In-Memory Rate Limiter ---
const rateLimits = new Map();

const rateLimit = {
  check: async (limit, ip) => {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    // Get existing requests for this IP
    const requests = (rateLimits.get(ip) || []).filter(t => t > windowStart);
    
    if (requests.length >= limit) {
      throw new Error('Rate limit exceeded');
    }
    
    // Add new request timestamp
    requests.push(now);
    rateLimits.set(ip, requests);
  }
};

// --- API Clients ---
async function callGemini(prompt, temperature = 0.7) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: clamp(temperature, 0.1, 1.0),
      maxOutputTokens: 2048
    }
  });
  
  return (await result.response).text();
}

async function callDeepSeek(prompt, temperature = 0.7) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY missing");

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
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek ${response.status}: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// --- Auto Mode Workflow ---
async function handleAutoMode(initialPrompt, temperature) {
  // Step 1: Analysis
  const analysisPrompt = `As a prompt engineer, analyze this prompt:
"${initialPrompt}"

Suggest improvements for:
1. Clarity of ambiguous terms
2. Additional context
3. Output format specification
4. Increased specificity

Return ONLY analysis.`;
  const analysis = await promiseWithTimeout(
    callGemini(analysisPrompt, temperature),
    TIMEOUT_MS
  );

  // Step 2: Improvement
  const improvementPrompt = `Analysis:
${analysis}

Original:
"${initialPrompt}"

Generate an improved version. Return ONLY the improved prompt.`;
  const improvedPrompt = await promiseWithTimeout(
    callDeepSeek(improvementPrompt, temperature),
    TIMEOUT_MS
  );

  // Step 3: Validation
  const validationPrompt = `Original: "${initialPrompt}"
Improved: "${improvedPrompt}"

Evaluate:
1. Intent preservation (1-5)
2. Analysis coverage (1-5)
3. Suggested refinements

Return as JSON: {preservation: number, coverage: number, refinements: string}`;
  const validation = await promiseWithTimeout(
    callGemini(validationPrompt, temperature),
    TIMEOUT_MS
  );

  return {
    result: improvedPrompt,
    diagnostics: {
      original: initialPrompt,
      analysis: smartTruncate(analysis, 1000),
      validation: smartTruncate(validation, 500)
    }
  };
}

// --- Main Handler ---
exports.handler = async (event) => {
  // Debug logs
  console.log("Function started. Checking environment variables...");
  console.log("GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);
  console.log("DEEPSEEK_API_KEY present:", !!process.env.DEEPSEEK_API_KEY);

  // Rate limiting
  try {
    const clientIP = event.headers['x-nf-client-connection-ip'] || '0.0.0.0';
    console.log(`Rate limiting check for IP: ${clientIP}`);
    await rateLimit.check(10, clientIP); // 10 requests/minute
  } catch (rateError) {
    console.error("Rate limit exceeded:", rateError);
    return {
      statusCode: 429,
      body: JSON.stringify({ 
        error: "Too many requests", 
        message: "Please wait a minute before making more requests" 
      })
    };
  }

  if (event.httpMethod !== 'POST') {
    console.error(`Invalid method: ${event.httpMethod}`);
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const requestBody = JSON.parse(event.body);
    console.log("Request body:", JSON.stringify(requestBody, null, 2));
    
    const { prompt, provider = 'auto', temperature = 0.7 } = requestBody;
    const cleanPrompt = sanitizeInput(prompt);
    const safeTemp = clamp(temperature, 0, 1);

    console.log(`Processing request with provider: ${provider}, temperature: ${safeTemp}`);

    switch (provider) {
      case 'auto':
        console.log("Handling auto mode...");
        const autoResult = await handleAutoMode(cleanPrompt, safeTemp);
        return {
          statusCode: 200,
          body: JSON.stringify({
            text: autoResult.result,
            provider: 'auto',
            components: autoResult.diagnostics
          })
        };
        
      case 'gemini':
        console.log("Calling Gemini...");
        const geminiText = await promiseWithTimeout(
          callGemini(cleanPrompt, safeTemp),
          TIMEOUT_MS
        );
        return {
          statusCode: 200,
          body: JSON.stringify({
            text: geminiText,
            provider: 'gemini'
          })
        };
        
      case 'deepseek':
        console.log("Calling DeepSeek...");
        const deepseekText = await promiseWithTimeout(
          callDeepSeek(cleanPrompt, safeTemp),
          TIMEOUT_MS
        );
        return {
          statusCode: 200,
          body: JSON.stringify({
            text: deepseekText,
            provider: 'deepseek'
          })
        };
        
      default:
        console.error(`Invalid provider: ${provider}`);
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid provider' })
        };
    }
  } catch (error) {
    console.error('Handler Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};