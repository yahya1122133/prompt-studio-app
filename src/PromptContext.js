// src/PromptContext.js
import React, { createContext, useReducer } from 'react';

const initialState = {
  promptLearning: {
    lengthPreference: 120,
    styleWeights: { technical: 0.5, creative: 0.5 },
    successfulPatterns: []
  },
  promptHistory: [], // Initialize promptHistory in the state
  // ... other state properties
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_AI_PROMPTS':
      return { ...state, aiPrompts: action.payload };
    case 'TRACK_PROMPT_PERFORMANCE':
      // Create a new record from the data passed in
      const newPerformanceRecord = {
        prompt: action.payload.prompt,
        source: action.payload.source,
        rating: action.payload.rating,
        timestamp: Date.now() // Add a timestamp for tracking over time
      };
      
      // Return a new state object
      return {
        ...state,
        // Add the new record to the beginning of the promptHistory array
        // .slice(-100) keeps the history from growing indefinitely
        promptHistory: [newPerformanceRecord, ...state.promptHistory].slice(0, 100)
      };
    // ... other actions
    default:
      return state;
  }
};

export const PromptContext = createContext();

export const PromptProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <PromptContext.Provider value={{ state, dispatch }}>
      {children}
    </PromptContext.Provider>
  );
};