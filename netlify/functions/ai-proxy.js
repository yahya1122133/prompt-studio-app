const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize AI models
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const deepseekHeaders = {
  Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  const { provider, prompt, temperature = 0.7 } = JSON.parse(event.body);
  
  try {
    if (provider === 'gemini') {
      return handleGemini(prompt, temperature);
    } else if (provider === 'deepseek') {
      return handleDeepSeek(prompt);
    } else if (provider === 'auto') {
      return handleAutoMode(prompt, temperature);
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid AI provider specified' })
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: `AI request failed: ${error.message}`,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

// Auto Mode: Gemini and DeepSeek collaborate to refine prompts
async function handleAutoMode(rawPrompt, temperature) {
  try {
    // Step 1: Gemini analyzes the prompt
    const analysisPrompt = `As a prompt engineering expert, analyze this user prompt for potential improvements:
"${rawPrompt}"

Provide specific suggestions to make it more clear, effective, and likely to produce high-quality AI responses. Focus on:
1. Clarifying ambiguous terms
2. Adding relevant context
3. Specifying desired output format
4. Improving specificity

Return ONLY your analysis and suggestions, no introductory text.`;
    
    const geminiAnalysis = await generateWithGemini(analysisPrompt, temperature);
    
    // Step 2: DeepSeek generates an improved prompt
    const improvementPrompt = `Based on this prompt analysis:
"${geminiAnalysis}"

Original prompt: "${rawPrompt}"

Generate an improved version of the original prompt that incorporates the suggestions. 
Keep the improved prompt concise while maintaining all essential elements. 
Return ONLY the improved prompt text with no additional commentary.`;
    
    const deepseekImproved = await generateWithDeepSeek(improvementPrompt);
    
    // Step 3: Gemini validates the improved prompt
    const validationPrompt = `Original prompt: "${rawPrompt}"
Improved prompt: "${deepseekImproved}"

As a prompt engineering specialist, evaluate this improved version:
1. Does it maintain the original intent?
2. Does it address all analysis points?
3. Could it be further refined?

Provide concise validation feedback. Return ONLY your validation notes.`;
    
    const geminiValidation = await generateWithGemini(validationPrompt, temperature);
    
    // Step 4: Final collaboration
    const finalResult = {
      text: `Auto Mode Results:\n\nOriginal Prompt:\n${rawPrompt}\n\nAnalysis:\n${geminiAnalysis}\n\nImproved Prompt:\n${deepseekImproved}\n\nValidation:\n${geminiValidation}`,
      components: {
        original: rawPrompt,
        analysis: geminiAnalysis,
        improved: deepseekImproved,
        validation: geminiValidation
      },
      provider: 'auto'
    };

    return {
      statusCode: 200,
      body: JSON.stringify(finalResult)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Auto mode failed: ${error.message}` })
    };
  }
}

// Helper functions
async function generateWithGemini(prompt, temperature = 0.7) {
  const result = await geminiModel.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { 
      temperature,
      maxOutputTokens: 1024 
    }
  });
  return (await result.response).text();
}

async function generateWithDeepSeek(prompt) {
  const response = await axios.post(
    'https://api.deepseek.com/v1/chat/completions',
    {
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1024
    },
    { headers: deepseekHeaders }
  );
  return response.data.choices[0].message.content;
}

// Existing handler functions
async function handleGemini(prompt, temperature) {
  const text = await generateWithGemini(prompt, temperature);
  return {
    statusCode: 200,
    body: JSON.stringify({ text, provider: 'gemini' })
  };
}

async function handleDeepSeek(prompt) {
  const text = await generateWithDeepSeek(prompt);
  return {
    statusCode: 200,
    body: JSON.stringify({ text, provider: 'deepseek' })
  };
}
