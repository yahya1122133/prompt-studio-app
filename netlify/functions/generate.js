const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');

// --- Helper Functions ---
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

const sanitizeInput = (text) => 
  text.replace(/[<>&"']/g, '').substring(0, 1000);

const smartTruncate = (text, maxLen) => {
  if (text.length <= maxLen) return text;
  const truncated = text.substring(0, maxLen);
  return truncated.substring(0, truncated.lastIndexOf('.') + 1);
};

const promiseWithTimeout = (promise, ms) => {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
};

async function callGemini(prompt, temperature) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  return smartTruncate(responseText, 2000);
}

async function callDeepSeek(prompt, temperature) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured.");
  
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: clamp(temperature, 0.1, 1.0),
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`DeepSeek API error (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  const responseText = data.choices[0].message.content;
  return smartTruncate(responseText, 2000);
}

// --- Main Handler ---
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { finalPrompt, provider, temperature } = JSON.parse(event.body);
    
    // Input validation and sanitization
    if (!finalPrompt || typeof finalPrompt !== 'string' || finalPrompt.trim() === '') {
      return { statusCode: 400, body: JSON.stringify({ message: "Invalid 'finalPrompt' provided." }) };
    }
    const cleanPrompt = sanitizeInput(finalPrompt);
    const safeTemp = clamp(temperature, 0, 1);

    console.log(`Request: ${provider} | Temp: ${safeTemp}`);
    console.log(`Prompt: ${cleanPrompt.substring(0, 80)}${cleanPrompt.length > 80 ? '...' : ''}`);

    let result;
    let source;
    const TIMEOUT_MS = 15000;

    if (provider === 'auto') {
      source = 'Auto (Collaborative)';
      
      const brainstormPrompt = `As a creative assistant, generate 2-3 diverse prompt variations based on:\n"${cleanPrompt}"`;
      const brainstormedIdeas = await promiseWithTimeout(
        callGemini(brainstormPrompt, clamp(safeTemp * 1.2, 0, 1)),
        TIMEOUT_MS
      );

      // Fallback if initial ideas are poor
      if (!brainstormedIdeas || brainstormedIdeas.split('\n').length < 2) {
        const fallbackPrompt = `Generate an excellent prompt variation based on:\n"${cleanPrompt}"`;
        result = await promiseWithTimeout(
          callDeepSeek(fallbackPrompt, clamp(safeTemp * 0.8, 0, 1)),
          TIMEOUT_MS
        );
        source = 'Auto (Fallback)';
      } else {
        const editorPrompt = `As an expert prompt engineer, analyze these ideas:\n---\n${brainstormedIdeas}\n---\nSelect the best concept and refine it into a single superior prompt. Return ONLY the final prompt.`;
        result = await promiseWithTimeout(
          callDeepSeek(editorPrompt, clamp(safeTemp * 0.8, 0, 1)),
          TIMEOUT_MS
        );
      }

    } else if (provider === 'gemini') {
      const prompt = `Generate a high-quality prompt variation based on:\n"${cleanPrompt}"\nReturn ONLY the new prompt.`;
      result = await promiseWithTimeout(
        callGemini(prompt, safeTemp), 
        TIMEOUT_MS
      );
      source = 'Gemini';

    } else if (provider === 'deepseek') {
      const prompt = `Generate a high-quality prompt variation based on:\n"${cleanPrompt}"\nReturn ONLY the new prompt.`;
      result = await promiseWithTimeout(
        callDeepSeek(prompt, safeTemp), 
        TIMEOUT_MS
      );
      source = 'DeepSeek';
    } else {
      return { statusCode: 400, body: JSON.stringify({ message: "Invalid provider" }) };
    }

    // Validate AI response
    if (!result || result.trim().length < 10) {
      throw new Error("AI returned an invalid response");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ result: smartTruncate(result, 2000), source }),
    };

  } catch (error) {
    console.error("Handler Error:", error.stack || error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message || "Server error" }),
    };
  }
};