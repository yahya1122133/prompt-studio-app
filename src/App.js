import React, { useState, useEffect, useMemo, createContext, useContext, useReducer, useRef } from 'react';
import { ArrowRight, Book, Bot, Copy, History, Loader2, Save, Search, Settings, Trash2, Wand2, X, Plus, Sparkles } from 'lucide-react';

// ===== HELPER FUNCTIONS =====
const extractPatterns = (prompt) => {
  const hasSteps = prompt.includes("1)") || prompt.includes("Step") || prompt.includes("step");
  const hasExamples = prompt.includes("example") || prompt.includes("e.g.") || prompt.includes("for instance");
  return { hasSteps, hasExamples };
};

const detectStyle = (prompt) => {
  const techTerms = ["technical", "specifically", "parameters", "algorithm", "code"];
  const creativeTerms = ["imagine", "creative", "innovative", "story", "poem"];
  return {
    technical: techTerms.some(t => prompt.toLowerCase().includes(t)) ? 1 : 0,
    creative: creativeTerms.some(t => prompt.toLowerCase().includes(t)) ? 1 : 0
  };
};

const updateStyleWeights = (currentWeights, newStyle, isSuccess = true) => {
  return {
    technical: Math.max(0, Math.min(1, 
      isSuccess
        ? (currentWeights.technical * 0.9) + (newStyle.technical * 0.1)
        : (currentWeights.technical * 0.9) - (newStyle.technical * 0.1)
    )),
    creative: Math.max(0, Math.min(1,
      isSuccess
        ? (currentWeights.creative * 0.9) + (newStyle.creative * 0.1)
        : (currentWeights.creative * 0.9) - (newStyle.creative * 0.1)
    ))
  };
};

const learnFromSuccess = (learningState, prompt) => {
  const patterns = extractPatterns(prompt);
  const style = detectStyle(prompt);
  
  return {
    ...learningState,
    successfulPatterns: [...learningState.successfulPatterns, patterns].slice(-50),
    styleWeights: updateStyleWeights(learningState.styleWeights, style)
  };
};

const learnFromRejection = (learningState, prompt) => {
  return {
    ...learningState,
    avoidedPatterns: [...learningState.avoidedPatterns, prompt].slice(-50)
  };
};

// ===== INITIAL STATE =====
const initialState = {
  promptTemplate: '',
  variables: [],
  apiResponse: '',
  responseHistory: [],
  isLoading: false,
  isSaving: false,
  temperature: 0.7,
  savedPrompts: [],
  filteredPrompts: [],
  librarySearchTerm: '',
  selectedPromptId: null,
  promptName: 'Untitled Prompt',
  showLibrary: false,
  promptToDelete: null,
  statusMessage: { text: '', type: '', id: 0 },
  
  // AI Prompt Generation State
  aiGeneratedPrompts: [],
  isGeneratingPrompts: false,
  autoMode: false,
  selectedProvider: 'deepseek',
  providerWeights: {
    deepseek: 0.5,
    gemini: 0.5
  },
  
  // Learning State
  promptHistory: [],
  promptLearning: {
    successfulPatterns: [],
    avoidedPatterns: [],
    lengthPreference: null,
    styleWeights: {
      technical: 0.5,
      creative: 0.5
    }
  },
};

// ===== REDUCER =====
const promptReducer = (state, action) => {
  switch (action.type) {
    case 'SET_PROMPT_TEMPLATE':
      return { ...state, promptTemplate: action.payload };
    case 'SET_VARIABLES':
      return { ...state, variables: action.payload };
    case 'SET_API_RESPONSE':
      return { ...state, apiResponse: action.payload };
    case 'ADD_TO_HISTORY':
      return { ...state, responseHistory: [action.payload, ...state.responseHistory].slice(0, 5) };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_SAVING':
      return { ...state, isSaving: action.payload };
    case 'SET_TEMPERATURE':
      return { ...state, temperature: action.payload };
    case 'LOAD_PROMPTS':
      return { ...state, savedPrompts: action.payload };
    case 'SET_FILTERED_PROMPTS':
      return { ...state, filteredPrompts: action.payload };
    case 'SET_LIBRARY_SEARCH':
      return { ...state, librarySearchTerm: action.payload };
    case 'SELECT_PROMPT':
      return { ...state, selectedPromptId: action.payload };
    case 'SET_PROMPT_NAME':
      return { ...state, promptName: action.payload };
    case 'TOGGLE_LIBRARY':
      return { ...state, showLibrary: action.payload };
    case 'SET_PROMPT_TO_DELETE':
      return { ...state, promptToDelete: action.payload };
    case 'SET_STATUS':
      return { ...state, statusMessage: action.payload };
    
    // AI Prompt Generation
    case 'SET_AI_PROMPTS':
      return { ...state, aiGeneratedPrompts: action.payload };
    case 'SET_GENERATING_PROMPTS':
      return { ...state, isGeneratingPrompts: action.payload };
    case 'TOGGLE_AUTO_MODE':
      return { ...state, autoMode: action.payload };
    case 'SET_PROVIDER':
      return { ...state, selectedProvider: action.payload };
    case 'UPDATE_PROVIDER_WEIGHTS':
      return { 
        ...state, 
        providerWeights: {
          ...state.providerWeights,
          [action.payload.provider]: action.payload.weight 
        }
      };
    
    // Learning
    case 'TRACK_PROMPT_PERFORMANCE':
      return {
        ...state,
        promptHistory: [
          ...state.promptHistory,
          {
            prompt: action.payload.prompt,
            source: action.payload.source,
            rating: action.payload.rating,
            timestamp: Date.now()
          }
        ].slice(-100)
      };
    case 'LOAD_HISTORY':
      return { ...state, promptHistory: action.payload || [] };
    case 'LOAD_LEARNING':
      return { ...state, promptLearning: action.payload || initialState.promptLearning };
    case 'LEARN_FROM_SUCCESS':
      return {
        ...state,
        promptLearning: learnFromSuccess(state.promptLearning, action.payload)
      };
    case 'LEARN_FROM_REJECTION':
      return {
        ...state,
        promptLearning: learnFromRejection(state.promptLearning, action.payload)
      };
    default:
      return state;
  }
};

// ===== CONTEXT =====
const PromptContext = createContext();

const PromptProvider = ({ children }) => {
  const [state, dispatch] = useReducer(promptReducer, initialState);

  // Load saved data from localStorage
  useEffect(() => {
    // Load saved prompts
    const savedPrompts = localStorage.getItem('promptStudioPrompts');
    if (savedPrompts) {
      dispatch({ type: 'LOAD_PROMPTS', payload: JSON.parse(savedPrompts) });
    }
    
    // Load prompt history
    const savedHistory = localStorage.getItem('promptRatings');
    if (savedHistory) {
      dispatch({ type: 'LOAD_HISTORY', payload: JSON.parse(savedHistory) });
    }
    
    // Load learning data
    const savedLearning = localStorage.getItem('promptLearning');
    if (savedLearning) {
      dispatch({ type: 'LOAD_LEARNING', payload: JSON.parse(savedLearning) });
    }
  }, []);

  // Debounced save to localStorage
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem('promptStudioPrompts', JSON.stringify(state.savedPrompts));
      localStorage.setItem('promptRatings', JSON.stringify(state.promptHistory));
      localStorage.setItem('promptLearning', JSON.stringify(state.promptLearning));
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [state.savedPrompts, state.promptHistory, state.promptLearning]);

  return (
    <PromptContext.Provider value={{ state, dispatch }}>
      {children}
    </PromptContext.Provider>
  );
};

const usePromptContext = () => {
  const context = useContext(PromptContext);
  if (!context) {
    throw new Error('usePromptContext must be used within a PromptProvider');
  }
  return context;
};

// ===== COMPONENTS =====
const Card = ({ children, className = '', title, icon, actions }) => (
  <section className={`bg-white/5 border border-white/10 rounded-xl shadow-lg backdrop-blur-sm ${className}`}>
    {(title || icon || actions) && (
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {icon}
          {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className="p-4">{children}</div>
  </section>
);

const Button = ({ children, onClick, variant = 'primary', disabled = false, className = '', ariaLabel }) => {
  const baseStyles = 'px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 active:scale-95';
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed focus:ring-indigo-500',
    secondary: 'bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:bg-gray-700/50 disabled:cursor-not-allowed focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-500',
  };
  return (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      aria-label={ariaLabel}
      className={`${baseStyles} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const IconButton = ({ children, onClick, disabled = false, tooltip, ariaLabel }) => (
  <div className="relative group">
    <button 
      onClick={onClick} 
      disabled={disabled} 
      aria-label={ariaLabel || tooltip}
      className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
    {tooltip && (
      <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 text-white text-xs rounded-md px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {tooltip}
      </span>
    )}
  </div>
);

const Spinner = () => <Loader2 className="animate-spin" aria-label="Loading" />;

const AutoModeToggle = () => {
  const { state, dispatch } = usePromptContext();
  
  return (
    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
      <div className="flex items-center gap-2">
        <Settings size={16} className="text-indigo-400" />
        <span className="font-medium">Auto Mode</span>
        <span className="text-xs bg-indigo-900/30 px-2 py-1 rounded-full">
          {state.autoMode ? 'Active' : 'Off'}
        </span>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input 
          type="checkbox" 
          checked={state.autoMode}
          onChange={() => dispatch({ type: 'TOGGLE_AUTO_MODE', payload: !state.autoMode })}
          className="sr-only peer" 
        />
        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
      </label>
    </div>
  );
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

// ===== AI PROMPT GENERATOR COMPONENT =====
const AIPromptGenerator = () => {
  const { state, dispatch } = usePromptContext();
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const generatePrompts = async () => {
    if (!state.promptTemplate.trim()) return;
    
    dispatch({ type: 'SET_GENERATING_PROMPTS', payload: true });
    dispatch({ type: 'SET_AI_PROMPTS', payload: [] });

    try {
      const endpoint = state.autoMode 
        ? "/.netlify/functions/auto-generate" 
        : `/.netlify/functions/${state.selectedProvider}-proxy`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: state.promptTemplate,
          temperature: state.temperature
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      dispatch({ type: 'SET_AI_PROMPTS', payload: data.prompts });

      if (state.autoMode && data.sources?.length === 2) {
        dispatch({
          type: 'UPDATE_PROVIDER_WEIGHTS',
          payload: {
            provider: 'deepseek',
            weight: Math.min(state.providerWeights.deepseek + 0.1, 0.8)
          }
        });
      }
    } catch (error) {
      dispatch({ 
        type: 'SET_STATUS', 
        payload: { 
          text: `Error: ${error.message}`, 
          type: "error",
          id: Date.now()
        } 
      });
      
      if (state.autoMode) {
        dispatch({ 
          type: 'SET_STATUS', 
          payload: { 
            text: "Falling back to DeepSeek...", 
            type: "warning",
            id: Date.now()
          } 
        });
        await generateWithSingleProvider('deepseek');
      }
    } finally {
      dispatch({ type: 'SET_GENERATING_PROMPTS', payload: false });
    }
  };

  const generateWithSingleProvider = async (provider) => {
    try {
      const response = await fetch(`/.netlify/functions/${provider}-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: state.promptTemplate,
          temperature: state.temperature
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      dispatch({ type: 'SET_AI_PROMPTS', payload: data.prompts });
    } catch (error) {
      dispatch({ 
        type: 'SET_STATUS', 
        payload: { 
          text: `Fallback failed: ${error.message}`, 
          type: "error",
          id: Date.now()
        } 
      });
    }
  };

  const finalPrompt = useMemo(() => {
    return state.variables.reduce((acc, curr) => {
      const regex = new RegExp(`{{\\s*${curr.name}\\s*}}`, 'g');
      return acc.replace(regex, curr.value || `{{${curr.name}}}`);
    }, state.promptTemplate);
  }, [state.promptTemplate, state.variables]);

  return (
    <Card 
      title="AI Prompt Generator" 
      icon={<Sparkles className="text-yellow-400" />}
      className="relative"
      actions={
        <div className="flex items-center">
          <div className={`w-2 h-2 rounded-full mr-1 ${
            state.promptLearning.successfulPatterns.length > 10 
              ? 'bg-green-500 animate-pulse' 
              : 'bg-yellow-500'
          }`} />
          <span className="text-xs text-gray-400">
            {state.promptLearning.successfulPatterns.length}/50
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Provider Selector - Only show in manual mode */}
        {!state.autoMode && (
          <div className="flex gap-2 mb-2">
            {['deepseek', 'gemini'].map(provider => (
              <button
                key={provider}
                onClick={() => dispatch({ type: 'SET_PROVIDER', payload: provider })}
                className={`flex-1 py-2 rounded-lg border text-sm ${
                  state.selectedProvider === provider
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-gray-800/50 border-white/10 text-gray-300 hover:bg-gray-700/50'
                } transition-colors`}
                aria-label={`Select ${provider}`}
              >
                {provider === 'deepseek' ? 'DeepSeek' : 'Gemini'}
              </button>
            ))}
          </div>
        )}

        <AutoModeToggle />

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {state.autoMode ? "Describe what you need (Auto-optimized)" : `Tell ${state.selectedProvider} what to generate`}
          </label>
          <textarea
            ref={inputRef}
            value={state.promptTemplate}
            onChange={(e) => dispatch({ type: 'SET_PROMPT_TEMPLATE', payload: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && generatePrompts()}
            className="w-full h-24 bg-gray-900/50 border border-white/10 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
            disabled={state.isGeneratingPrompts}
            placeholder="e.g., Create a marketing campaign for eco-friendly products"
          />
        </div>

        <Button
          onClick={generatePrompts}
          disabled={state.isGeneratingPrompts || !state.promptTemplate.trim()}
          className="w-full"
          ariaLabel="Generate AI prompts"
        >
          {state.isGeneratingPrompts ? (
            <Spinner />
          ) : (
            <>
              <Sparkles size={16} />
              {state.autoMode ? "Generate (Auto)" : `Generate with ${state.selectedProvider === 'deepseek' ? 'DeepSeek' : 'Gemini'}`}
            </>
          )}
        </Button>

        {state.aiGeneratedPrompts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Wand2 size={16} />
                Suggestions
              </h4>
              <button
                onClick={() => dispatch({ type: 'SET_AI_PROMPTS', payload: [] })}
                className="text-xs text-gray-400 hover:text-white"
                aria-label="Clear suggestions"
              >
                Clear
              </button>
            </div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {state.aiGeneratedPrompts.map((prompt, i) => (
                <div
                  key={`prompt-${i}`}
                  className="p-3 bg-gray-800/50 rounded-lg border border-white/10 hover:bg-gray-700/50 transition group cursor-pointer"
                  onClick={() => {
                    dispatch({ type: 'SET_PROMPT_TEMPLATE', payload: prompt });
                    dispatch({ type: 'SET_AI_PROMPTS', payload: [] });
                  }}
                >
                  <p className="text-sm text-gray-200">{prompt}</p>
                  <PromptRating 
                    prompt={prompt} 
                    source={state.selectedProvider} 
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

// ===== FOOTER COMPONENT =====
const Footer = () => {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState({
    email: '',
    issueType: 'Bug Report',
    description: ''
  });

  const handleReportSubmit = (e) => {
    e.preventDefault();
    const subject = `Issue Report: ${reportData.issueType}`;
    const body = `${reportData.description}\n\nFrom: ${reportData.email}`;
    window.location.href = `mailto:mindsetwarriorsacademy@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    alert("Your report has been submitted. Thank you!");
    setShowReport(false);
    setReportData({ email: '', issueType: 'Bug Report', description: '' });
  };

  const handleReportChange = (e) => {
    const { name, value } = e.target;
    setReportData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <>
      <footer className="mt-16 py-8 border-t border-white/10 bg-gradient-to-t from-gray-900/50 to-transparent">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-center md:text-left mb-6 md:mb-0">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <span className="text-lg font-bold text-white">PromptCraft</span>
              </div>
              <p className="text-gray-400 text-sm">
                © 2025 PromptCraft. All rights reserved.
              </p>
              <p className="text-gray-500 text-sm mt-1">
                Made with <span className="text-red-500">❤️</span> for AI enthusiasts
              </p>
            </div>
            
            <div className="flex flex-wrap justify-center gap-4 md:gap-6">
              <button 
                className="text-gray-400 hover:text-indigo-400 text-sm transition-colors font-medium"
                onClick={() => setShowReport(true)}
              >
                Report an Issue
              </button>
              <button 
                className="text-gray-400 hover:text-indigo-400 text-sm transition-colors font-medium"
                onClick={() => setShowPrivacy(true)}
              >
                Privacy Policy
              </button>
              <button 
                className="text-gray-400 hover:text-indigo-400 text-sm transition-colors font-medium"
                onClick={() => setShowTerms(true)}
              >
                Terms of Service
              </button>
            </div>
          </div>
          
          <div className="mt-8 text-center">
            <p className="text-gray-600 text-xs">
              Prompt Studio v1.2.0 | Powered by AI APIs | Contact: mindsetwarriorsacademy@gmail.com
            </p>
          </div>
        </div>
      </footer>
      
      {/* Privacy Policy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-white/10 rounded-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-800/95 backdrop-blur-sm z-10 p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Privacy Policy</h2>
              <button 
                className="p-2 rounded-full hover:bg-white/10"
                onClick={() => setShowPrivacy(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 prose prose-invert max-w-none">
              {/* Privacy policy content */}
            </div>
          </div>
        </div>
      )}
      
      {/* Terms of Service Modal */}
      {showTerms && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-white/10 rounded-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-800/95 backdrop-blur-sm z-10 p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Terms of Service</h2>
              <button 
                className="p-2 rounded-full hover:bg-white/10"
                onClick={() => setShowTerms(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 prose prose-invert max-w-none">
              {/* Terms of service content */}
            </div>
          </div>
        </div>
      )}
      
      {/* Report Issue Modal */}
      {showReport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-white/10 rounded-xl w-full max-w-md">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Report an Issue</h2>
              <button 
                className="p-2 rounded-full hover:bg-white/10"
                onClick={() => setShowReport(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleReportSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Your Email</label>
                    <input 
                      type="email"
                      name="email"
                      value={reportData.email}
                      onChange={handleReportChange}
                      placeholder="email@example.com"
                      className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Issue Type</label>
                    <select 
                      name="issueType"
                      value={reportData.issueType}
                      onChange={handleReportChange}
                      className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="Bug Report">Bug Report</option>
                      <option value="Feature Request">Feature Request</option>
                      <option value="Security Issue">Security Issue</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                    <textarea 
                      name="description"
                      value={reportData.description}
                      onChange={handleReportChange}
                      rows={4}
                      placeholder="Please describe the issue in detail..."
                      className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    ></textarea>
                  </div>
                  
                  <button 
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-lg transition-colors"
                  >
                    Submit Report
                  </button>
                </div>
              </form>
              
              <p className="mt-6 text-center text-gray-400 text-sm">
                Or email us directly at: <br />
                <a 
                  href="mailto:mindsetwarriorsacademy@gmail.com" 
                  className="text-indigo-400 hover:underline break-all"
                >
                  mindsetwarriorsacademy@gmail.com
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ===== MAIN APP COMPONENT =====
function App() {
  const { state, dispatch } = usePromptContext();
  const {
    promptTemplate,
    variables,
    apiResponse,
    responseHistory,
    isLoading,
    isSaving,
    temperature,
    savedPrompts,
    filteredPrompts,
    librarySearchTerm,
    selectedPromptId,
    promptName,
    showLibrary,
    promptToDelete,
    statusMessage
  } = state;

  const showStatus = (text, type = 'info', duration = 3000) => {
    const id = Date.now();
    dispatch({ type: 'SET_STATUS', payload: { text, type, id } });
    setTimeout(() => {
      dispatch({ type: 'SET_STATUS', payload: { text: '', type: '', id: 0 } });
    }, duration);
  };

  useEffect(() => {
    // Extract variables from template (e.g., {{variable}})
    const regex = /{{\s*(\w+)\s*}}/g;
    const matches = promptTemplate.match(regex) || [];
    
    // Get unique variable names
    const uniqueVars = [...new Set(matches.map(v => v.replace(/{{\s*|\s*}}/g, '')))];
    
    // Update variables in state
    dispatch({
      type: 'SET_VARIABLES',
      payload: uniqueVars.map(name => {
        const existingVar = variables.find(v => v.name === name);
        return existingVar || { name, value: '' };
      })
    });
  }, [promptTemplate, variables, dispatch]);

  useEffect(() => {
    dispatch({
      type: 'SET_FILTERED_PROMPTS',
      payload: savedPrompts.filter(p => 
        p.name.toLowerCase().includes(librarySearchTerm.toLowerCase()) ||
        p.template.toLowerCase().includes(librarySearchTerm.toLowerCase())
      )
    });
  }, [librarySearchTerm, savedPrompts, dispatch]); // Added missing dependency

  const handleVariableChange = (index, value) => {
    const newVariables = [...variables];
    newVariables[index].value = value;
    dispatch({ type: 'SET_VARIABLES', payload: newVariables });
  };

  const handleTestPrompt = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_API_RESPONSE', payload: '' });
    showStatus("Generating response...", "info", 5000);

    try {
      // Simulated API call
      setTimeout(() => {
        dispatch({ 
          type: 'SET_API_RESPONSE', 
          payload: "This is a simulated API response. In a real implementation, this would come from an AI API." 
        });
        dispatch({ 
          type: 'ADD_TO_HISTORY', 
          payload: "Simulated response for testing" 
        });
        showStatus("Success!", "success");
        dispatch({ type: 'SET_LOADING', payload: false });
      }, 1500);
    } catch (error) {
      const err = error;
      console.error('API Error:', err);
      dispatch({ 
        type: 'SET_API_RESPONSE', 
        payload: `An error occurred: ${err.message}` 
      });
      showStatus(err.message, "error", 5000);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleSavePrompt = () => {
    if (!promptName) return;
    dispatch({ type: 'SET_SAVING', payload: true });
    
    const cleanName = promptName.replace(/\*$/, '');
    let newPrompts;
    const promptData = { 
      name: cleanName, 
      template: promptTemplate, 
      temperature, 
      savedAt: Date.now() 
    };
    
    if (selectedPromptId) {
      newPrompts = savedPrompts.map(p => 
        p.id === selectedPromptId ? { ...p, ...promptData } : p
      );
    } else {
      const newPrompt = { 
        id: Date.now().toString(), 
        ...promptData 
      };
      newPrompts = [newPrompt, ...savedPrompts];
      dispatch({ type: 'SELECT_PROMPT', payload: newPrompt.id });
    }

    dispatch({ type: 'LOAD_PROMPTS', payload: newPrompts });
    dispatch({ type: 'SET_PROMPT_NAME', payload: cleanName });
    showStatus(selectedPromptId ? "Prompt updated." : "Prompt saved.", "success");
    dispatch({ type: 'SET_SAVING', payload: false });
  };

  const handleLoadPrompt = (prompt) => {
    dispatch({ type: 'SELECT_PROMPT', payload: prompt.id });
    dispatch({ type: 'SET_PROMPT_NAME', payload: prompt.name });
    dispatch({ type: 'SET_PROMPT_TEMPLATE', payload: prompt.template });
    dispatch({ type: 'SET_TEMPERATURE', payload: prompt.temperature || 0.7 });
    dispatch({ type: 'SET_API_RESPONSE', payload: '' });
    dispatch({ type: 'TOGGLE_LIBRARY', payload: false });
    showStatus(`Loaded "${prompt.name}".`, "info");
  };
  
  const handleNewPrompt = () => {
    dispatch({ type: 'SELECT_PROMPT', payload: null });
    dispatch({ type: 'SET_PROMPT_NAME', payload: "Untitled Prompt" });
    dispatch({ type: 'SET_PROMPT_TEMPLATE', payload: "Your new prompt template with a {{variable}} here." });
    dispatch({ type: 'SET_API_RESPONSE', payload: '' });
    showStatus("Started a new prompt.", "info");
  };
  
  const confirmActionDelete = () => {
    if (!promptToDelete) return;
    const newPrompts = savedPrompts.filter(p => p.id !== promptToDelete);
    dispatch({ type: 'LOAD_PROMPTS', payload: newPrompts });
    showStatus("Prompt deleted.", "success");
    if (selectedPromptId === promptToDelete) handleNewPrompt();
    dispatch({ type: 'SET_PROMPT_TO_DELETE', payload: null });
  };

  // Load saved prompts and variables from localStorage
  useEffect(() => {
    // Load saved prompts from localStorage
    const savedPrompts = JSON.parse(localStorage.getItem('promptStudioPrompts')) || [];
    dispatch({ type: 'LOAD_PROMPTS', payload: savedPrompts });

    // Load variables from localStorage
    const savedVariables = JSON.parse(localStorage.getItem('promptStudioVariables')) || {};
    dispatch({ type: 'SET_VARIABLES', payload: savedVariables });

    // Apply variables to template
    if (promptTemplate) {
      const applied = Object.keys(savedVariables).reduce((tpl, key) => {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        return tpl.replace(regex, savedVariables[key]);
      }, promptTemplate);
      dispatch({ type: 'SET_PROMPT_TEMPLATE', payload: applied });
    }
  }, [dispatch, promptTemplate]);

  useEffect(() => {
    // Your effect logic
  }, [dispatch, variables]); // Added missing dependencies

  useEffect(() => {
    // Your effect logic  
  }, [dispatch]); // Added missing dependency

  useEffect(() => {
    // Your effect logic
  }, [promptTemplate]); // Added missing dependency

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans p-4 lg:p-6 bg-grid-white/[0.05] pb-24 sm:pb-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
          <div className="flex items-center gap-3 mb-4 sm:mb-0">
            <Sparkles className="w-8 h-8 text-indigo-400" />
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Prompt Studio</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => dispatch({ type: 'TOGGLE_LIBRARY', payload: true })} 
              variant="secondary"
              ariaLabel="Open prompt library"
            >
              <Book size={16} /> My Library ({savedPrompts.length})
            </Button>
            <Button 
              onClick={handleNewPrompt}
              ariaLabel="Create new prompt"
            >
              <Plus size={16} /> New Prompt
            </Button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="flex flex-col gap-6">
            <AIPromptGenerator />
            
            <Card title="Prompt Editor" icon={<Wand2 className="text-indigo-400" />}>
              <textarea 
                value={promptTemplate} 
                onChange={(e) => {
                  dispatch({ type: 'SET_PROMPT_TEMPLATE', payload: e.target.value });
                  if (selectedPromptId) {
                    dispatch({ type: 'SELECT_PROMPT', payload: null });
                    dispatch({ type: 'SET_PROMPT_NAME', payload: promptName.endsWith('*') ? promptName : `${promptName}*` });
                  }
                }} 
                className="w-full h-48 bg-gray-900/50 border border-white/10 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow font-mono text-sm leading-relaxed" 
                placeholder="e.g., Generate a tweet about {{product}}."
                aria-label="Prompt template editor"
              />
              <Button 
                onClick={handleTestPrompt} 
                disabled={isLoading} 
                className="w-full mt-4"
                ariaLabel="Test prompt with Gemini"
              >
                {isLoading ? <Spinner /> : <Sparkles size={16} />} 
                {isLoading ? 'Generating...' : 'Test with AI'}
              </Button>
            </Card>

            {variables.length > 0 && (
              <Card title="Variables" icon={<ArrowRight className="text-green-400" />}>
                <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
                  {variables.map((v, i) => (
                    <div key={i}>
                      <label 
                        htmlFor={`var-${i}`}
                        className="block text-sm font-medium text-gray-300 mb-1.5 font-mono"
                      >
                        {v.name}
                      </label>
                      <input 
                        id={`var-${i}`}
                        type="text" 
                        value={v.value} 
                        onChange={(e) => handleVariableChange(i, e.target.value)} 
                        className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-2 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
                        aria-label={`Value for ${v.name} variable`}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
          
          {/* Right Column */}
          <div className="flex flex-col gap-6">
            <Card 
              title="Latest AI Response" 
              icon={<Bot className="text-purple-400" />} 
              className="h-full flex flex-col" 
              actions={
                <IconButton 
                  onClick={() => {
                    navigator.clipboard.writeText(apiResponse); 
                    showStatus('Response copied!', 'success');
                  }} 
                  disabled={!apiResponse} 
                  tooltip="Copy"
                  ariaLabel="Copy AI response"
                >
                  <Copy size={16}/>
                </IconButton>
              }
            >
              <div 
                className="flex-grow h-full bg-gray-900/50 border-white/10 rounded-lg p-3 text-gray-200 overflow-y-auto prose prose-invert prose-sm max-w-none min-h-[20rem]"
                aria-live="polite"
                aria-atomic="true"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <Spinner /> 
                    <span className="ml-2">Waiting...</span>
                  </div>
                ) : apiResponse ? (
                  <p className="whitespace-pre-wrap">{apiResponse}</p>
                ) : (
                  <p className="text-gray-500 flex items-center justify-center h-full">
                    The AI's response will appear here.
                  </p>
                )}
              </div>
            </Card>

            <Card 
              title="Response History" 
              icon={<History className="text-gray-400" />} 
              actions={
                <Button 
                  onClick={() => dispatch({ type: 'ADD_TO_HISTORY', payload: [] })} 
                  variant="secondary" 
                  className="px-2 py-1 text-xs" 
                  disabled={responseHistory.length === 0}
                  ariaLabel="Clear response history"
                >
                  Clear
                </Button>
              }
            >
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {responseHistory.length > 0 ? (
                  responseHistory.map((r, i) => (
                    <div 
                      key={i} 
                      className="text-sm p-2 bg-white/5 rounded-md border border-white/10 text-gray-400 truncate" 
                      title={r}
                      aria-label={`Previous response ${i+1}`}
                    >
                      {r}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm">
                    Previous responses will be logged here.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </main>
        
        <div className="mt-6">
          <Card>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <input 
                type="text" 
                value={promptName} 
                onChange={(e) => dispatch({ type: 'SET_PROMPT_NAME', payload: e.target.value })} 
                className="w-full sm:w-1/2 bg-gray-900/50 border border-white/10 rounded-lg p-2 text-gray-200 focus:ring-2 focus:ring-indigo-500" 
                placeholder="Enter a name for this prompt..."
                aria-label="Prompt name"
              />
              <Button 
                onClick={handleSavePrompt} 
                disabled={isSaving || !promptName} 
                className="w-full sm:w-auto"
                ariaLabel="Save prompt to library"
              >
                {isSaving ? <Spinner /> : <Save size={16} />} 
                {selectedPromptId ? 'Update Prompt' : 'Save to Library'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
      
      <Footer />
      
      {/* Existing Modals */}
      {showLibrary && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onClick={() => dispatch({ type: 'TOGGLE_LIBRARY', payload: false })}
          role="dialog"
          aria-modal="true"
        >
          <div 
            className="bg-gray-800 border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-xl font-semibold text-white">My Prompt Library</h3>
              <IconButton 
                onClick={() => dispatch({ type: 'TOGGLE_LIBRARY', payload: false })}
                ariaLabel="Close library"
              >
                <X size={20} />
              </IconButton>
            </div>
            <div className="p-4 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="search" 
                  placeholder="Search library..." 
                  value={librarySearchTerm} 
                  onChange={e => dispatch({ type: 'SET_LIBRARY_SEARCH', payload: e.target.value })} 
                  className="w-full bg-gray-900/50 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-gray-200 focus:ring-2 focus:ring-indigo-500" 
                  aria-label="Search prompts"
                />
              </div>
            </div>
            <div className="p-4 max-h-[50vh] overflow-y-auto">
              {filteredPrompts.length > 0 ? (
                <ul className="space-y-2">
                  {filteredPrompts.map(p => (
                    <li 
                      key={p.id} 
                      className="group flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" 
                      onClick={() => handleLoadPrompt(p)}
                      aria-label={`Load prompt: ${p.name}`}
                    >
                      <div>
                        <p className="font-semibold text-white">{p.name}</p>
                        <p className="text-xs text-gray-400 truncate max-w-md">{p.template}</p>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconButton 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            dispatch({ type: 'SET_PROMPT_TO_DELETE', payload: p.id }); 
                          }} 
                          tooltip="Delete"
                          ariaLabel={`Delete prompt: ${p.name}`}
                        >
                          <Trash2 size={16} className="text-red-400 hover:text-red-300"/>
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Book size={40} className="mx-auto mb-2"/>
                  <p>No prompts found.</p>
                  <p className="text-sm">
                    {savedPrompts.length > 0 ? "Try a different search term." : "Save a prompt to see it here."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {promptToDelete && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div 
            className="bg-gray-800 border border-white/10 rounded-xl w-full max-w-md shadow-2xl"
          >
            <div className="p-6 text-center">
              <h3 className="text-lg font-semibold text-white">Confirm Deletion</h3>
              <p className="text-gray-400 mt-2">
                Are you sure you want to delete this prompt? This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 p-4 bg-gray-900/50 rounded-b-xl">
              <Button 
                onClick={() => dispatch({ type: 'SET_PROMPT_TO_DELETE', payload: null })} 
                variant="secondary"
                ariaLabel="Cancel deletion"
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmActionDelete} 
                variant="danger"
                ariaLabel="Confirm deletion"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Status Message */}
      {statusMessage.text && (
        <div 
          className="fixed bottom-5 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div 
            className={`px-4 py-2 rounded-lg text-white text-sm shadow-2xl ${
              statusMessage.type === 'success' ? 'bg-green-600' : 
              statusMessage.type === 'error' ? 'bg-red-600' : 
              'bg-gray-700'
            }`}
          >
            {statusMessage.text}
          </div>
        </div>
      )}
    </div>
  );
};

// ===== APP WRAPPER =====
export default function AppWrapper() {
  return (
    <PromptProvider>
      <App />
    </PromptProvider>
  );
}