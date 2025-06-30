import React, { useState, useRef, useContext } from 'react';
import { Sparkles } from 'lucide-react';
import { PromptContext } from './PromptContext';
import Card from './ui/Card';
import Button from './ui/Button';
import Spinner from './ui/Spinner';

const AIPromptGenerator = () => {
  const { state, dispatch } = useContext(PromptContext);
  const [userInput, setUserInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const inputRef = useRef(null);

  const generatePrompts = async () => {
    if (!userInput.trim()) return;
    
    setIsGenerating(true);
    dispatch({ type: 'SET_AI_PROMPTS', payload: [] });

    try {
      const endpoint = state.autoMode 
        ? "/.netlify/functions/auto-generate" 
        : `/.netlify/functions/${state.selectedProvider}-proxy`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userInput,
          temperature: state.temperature
        })
      });

      const data = await response.json();
      dispatch({ type: 'SET_AI_PROMPTS', payload: data.prompts || [data.text] });
      
    } catch (error) {
      dispatch({ 
        type: 'SET_STATUS', 
        payload: { text: error.message, type: "error" } 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card 
      title="AI Prompt Generator" 
      icon={<Sparkles className="text-yellow-400" />}
      className="relative"
      actions={
        <div className="flex items-center">
          <div className={`w-2 h-2 rounded-full mr-1 ${
            state.promptLearning?.successfulPatterns?.length > 10 
              ? 'bg-green-500' 
              : 'bg-yellow-500'
          }`} />
          <span className="text-xs text-gray-400">
            {state.promptLearning?.successfulPatterns?.length || 0} learned
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <textarea
          ref={inputRef}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          className="w-full p-2 text-sm border rounded-md focus:ring-1 focus:ring-yellow-500 focus:outline-none"
          rows={4}
          placeholder="Enter your prompt here..."
        />
        <Button 
          onClick={generatePrompts} 
          className="w-full"
          disabled={isGenerating}
        >
          {isGenerating ? <Spinner size="sm" /> : 'Generate Prompts'}
        </Button>
      </div>
    </Card>
  );
};

export default AIPromptGenerator;