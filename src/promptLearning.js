// Helper functions
export const learnFromSuccess = (currentLearning, prompt) => {
  const patterns = {
    length: prompt.length,
    structure: analyzeStructure(prompt),
    style: detectStyle(prompt)
  };

  return {
    ...currentLearning,
    successfulPatterns: [...currentLearning.successfulPatterns, patterns].slice(-50),
    styleWeights: updateStyleWeights(currentLearning.styleWeights, patterns.style)
  };
};

const analyzeStructure = (prompt) => {
  // Extract structural patterns
  const hasSteps = prompt.includes("1)") || prompt.includes("Step");
  const hasExamples = prompt.includes("example") || prompt.includes("e.g.");
  return { hasSteps, hasExamples };
};

const detectStyle = (prompt) => {
  // Classify prompt style
  const techTerms = ["technical", "specifically", "parameters"];
  const creativeTerms = ["imagine", "creative", "innovative"];
  
  return {
    technical: techTerms.some(t => prompt.includes(t)) ? 1 : 0,
    creative: creativeTerms.some(t => prompt.includes(t)) ? 1 : 0
  };
};

const updateStyleWeights = (currentWeights, newStyle) => {
  // Smoothly adjust weights
  return {
    technical: (currentWeights.technical * 0.9) + (newStyle.technical * 0.1),
    creative: (currentWeights.creative * 0.9) + (newStyle.creative * 0.1)
  };
};