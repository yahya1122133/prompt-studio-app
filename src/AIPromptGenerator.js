// (Or inside your AIPromptGenerator component in App.js if not split)

const generateEnhancedPrompt = (basePrompt) => {
  const { promptLearning } = state;
  
  // Apply length normalization
  const targetLength = promptLearning.lengthPreference ||
    Math.max(80, Math.min(150, basePrompt.length));
  
  // Apply style blending
  const styleMix = `
    ${promptLearning.styleWeights.technical > 0.6 ? "Use technical terms." : ""}
    ${promptLearning.styleWeights.creative > 0.6 ? "Include creative analogies." : ""}
  `;

  // Apply successful structures
  const lastSuccess = promptLearning.successfulPatterns.slice(-1)[0];
  const structureHint = lastSuccess?.structure?.hasSteps ? " Present in clear steps." : "";

  return `Revise this prompt to:
1. Target ~${targetLength} characters
2. ${styleMix}
3. ${structureHint}
Original: ${basePrompt}`;
};

const handlePromptEdit = (originalPrompt, newPrompt) => {
  // ...your edit logic...
  dispatch({
    type: 'LEARN_FROM_REJECTION',
    payload: originalPrompt
  });
  // Optionally update the prompt with newPrompt
};

const handleGenerateClick = async () => {
  if (isGenerating) return;
  setIsGenerating(true);
  dispatch({ type: 'SET_AI_PROMPTS', payload: [] });

  try {
    const finalPrompt = state.autoMode 
      ? generateEnhancedPrompt(userInput)
      : userInput;

    const response = await fetch("/.netlify/functions/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt: finalPrompt,
        learning: state.promptLearning // Send learning context
      })
    });

    const data = await response.json();
    setAIPrompts(data.prompts);

    // ...any additional logic...
  } catch (error) {
    // ...error handling...
  } finally {
    setIsGenerating(false);
  }
};

// ===== PROMPT RATING COMPONENT =====
const PromptRating = ({ prompt, source }) => {
  const { dispatch } = usePromptContext();
  const [currentRating, setCurrentRating] = useState(0);

  const handleRating = (rating) => {
    setCurrentRating(rating);
    dispatch({
      type: 'TRACK_PROMPT_PERFORMANCE',
      payload: { prompt, source, rating }
    });
    if (rating >= 4) {
      dispatch({
        type: 'LEARN_FROM_SUCCESS',
        payload: prompt
      });
    }
  };

  return (
    <div className="flex items-center gap-1 mt-2">
      <span className="text-xs text-gray-400">Rate:</span>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => handleRating(star)}
          className="text-lg focus:outline-none"
          aria-label={`Rate ${star} stars`}
        >
          {star <= currentRating ? '⭐' : '☆'}
        </button>
      ))}
    </div>
  );
};

// ...inside your AIPromptGenerator component's return statement...

<Card 
  title="AI Prompt Generator" 
  icon={<Sparkles className="text-yellow-400" />}
  className="relative"
  actions={
    <div className="flex items-center">
      <div className={`w-2 h-2 rounded-full mr-1 ${
        state.promptLearning.successfulPatterns.length > 10 
          ? 'bg-green-500' 
          : 'bg-yellow-500'
      }`} />
      <span className="text-xs text-gray-400">
        {state.promptLearning.successfulPatterns.length} learned
      </span>
    </div>
  }
>
  {/* ...rest of your card content... */}
</Card>