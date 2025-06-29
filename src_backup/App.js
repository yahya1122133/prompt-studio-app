import React, { useEffect, useMemo, createContext, useContext, useReducer } from 'react';
import { ArrowRight, Book, Bot, Copy, History, Loader2, Save, Search, Settings, Trash2, Wand2, X, Plus, Sparkles } from 'lucide-react';
import { generateContent } from './services/gemini';

// Initial state
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
  statusMessage: { text: '', type: '', id: 0 }
};

// Reducer function
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
    default:
      return state;
  }
};

// Context
const PromptContext = createContext();

const PromptProvider = ({ children }) => {
  const [state, dispatch] = useReducer(promptReducer, initialState);

  useEffect(() => {
    const savedPrompts = localStorage.getItem('promptStudioPrompts');
    if (savedPrompts) {
      dispatch({ type: 'LOAD_PROMPTS', payload: JSON.parse(savedPrompts) });
    }
  }, []);

  useEffect(() => {
    if (state.savedPrompts.length > 0) {
      localStorage.setItem('promptStudioPrompts', JSON.stringify(state.savedPrompts));
    }
  }, [state.savedPrompts]);

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

// Components
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

// Main App Component
const App = () => {
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
    const regex = /{{\s*(\w+)\s*}}/g;
    const matches = promptTemplate.match(regex) || [];
    const uniqueVars = [...new Set(matches.map(v => v.replace(/{{\s*|\s*}}/g, '')))];
    dispatch({ 
      type: 'SET_VARIABLES', 
      payload: uniqueVars.map(name => {
        const existingVar = variables.find(v => v.name === name);
        return existingVar || { name, value: '' };
      })
    });
  }, [promptTemplate, variables]); // Added variables

  useEffect(() => {
    dispatch({
      type: 'SET_FILTERED_PROMPTS',
      payload: savedPrompts.filter(p => 
        p.name.toLowerCase().includes(librarySearchTerm.toLowerCase()) ||
        p.template.toLowerCase().includes(librarySearchTerm.toLowerCase())
      )
    });
  }, [librarySearchTerm, savedPrompts]);

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
      const response = await generateContent(finalPrompt, temperature);
      dispatch({ type: 'SET_API_RESPONSE', payload: response });
      dispatch({ type: 'ADD_TO_HISTORY', payload: response });
      showStatus("Success!", "success");
    } catch (error) {
      dispatch({ 
        type: 'SET_API_RESPONSE', 
        payload: `An error occurred: ${error.message}` 
      });
      showStatus(error.message, "error", 5000);
    } finally {
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
    dispatch({ type: 'ADD_TO_HISTORY', payload: [] });
    dispatch({ type: 'TOGGLE_LIBRARY', payload: false });
    showStatus(`Loaded "${prompt.name}".`, "info");
  };
  
  const handleNewPrompt = () => {
    dispatch({ type: 'SELECT_PROMPT', payload: null });
    dispatch({ type: 'SET_PROMPT_NAME', payload: "Untitled Prompt" });
    dispatch({ type: 'SET_PROMPT_TEMPLATE', payload: "Your new prompt template with a {{variable}} here." });
    dispatch({ type: 'SET_API_RESPONSE', payload: '' });
    dispatch({ type: 'ADD_TO_HISTORY', payload: [] });
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

  const finalPrompt = useMemo(() => {
    return variables.reduce((acc, curr) => {
      const regex = new RegExp(`{{\\s*${curr.name}\\s*}}`, 'g');
      return acc.replace(regex, curr.value || `{{${curr.name}}}`);
    }, promptTemplate);
  }, [promptTemplate, variables]);

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
                {isLoading ? 'Generating...' : 'Test with Gemini'}
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

            <Card title="AI Configuration" icon={<Settings className="text-gray-400" />}>
              <div className="space-y-4">
                <div>
                  <h3 className="block text-sm font-medium text-gray-300 mb-1.5">
                    Model
                  </h3>
                  <p className="text-sm text-gray-400 bg-gray-900/50 border border-white/10 rounded-lg py-2 px-3">
                    Gemini 2.0 Flash
                  </p>
                </div>
                <div>
                  <label 
                    htmlFor="temperature-slider"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    Temperature: <span className="font-mono text-indigo-400">{temperature}</span>
                  </label>
                  <input 
                    id="temperature-slider"
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1" 
                    value={temperature} 
                    onChange={e => dispatch({ type: 'SET_TEMPERATURE', payload: parseFloat(e.target.value) })} 
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
                    aria-label="AI temperature setting"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Lower values are more predictable. Higher values are more creative.
                  </p>
                </div>
              </div>
            </Card>
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
      
      {/* Library Modal */}
      {showLibrary && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300" 
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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300"
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
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 transition-all duration-300`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div 
            className={`px-4 py-2 rounded-lg text-white text-sm shadow-2xl ${statusMessage.type === 'success' ? 'bg-green-600' : (statusMessage.type === 'error' ? 'bg-red-600' : 'bg-gray-700')}`}
          >
            {statusMessage.text}
          </div>
        </div>
      )}
    </div>
  );
};

// App Wrapper
export default function AppWrapper() {
  return (
    <PromptProvider>
      <App />
    </PromptProvider>
  );
}