// src/PromptContext.js
import React, { createContext, useReducer } from 'react';

const initialState = {
  promptLearning: {
    lengthPreference: 120,
    styleWeights: { technical: 0.5, creative: 0.5 },
    successfulPatterns: []
  },
  // ... other state properties
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_AI_PROMPTS':
      return { ...state, aiPrompts: action.payload };
    case 'TRACK_PROMPT_PERFORMANCE':
      // Implementation
      return state;
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