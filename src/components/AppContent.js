import React, { useMemo, useState, useCallback, lazy, Suspense } from 'react';
import { 
  ArrowRight, Book, Bot, Copy, History, 
  Loader2, Save, Settings, 
  Wand2, Plus, Sparkles, X, Maximize 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { usePromptContext } from '../context/PromptContext';

// Lazy load child components
const Button = lazy(() => import('./ui/Button'));
const Card = lazy(() => import('./ui/Card'));
const PromptRating = lazy(() => import('./PromptRating'));

// Define memoized helper components
const Spinner = React.memo(() => <Loader2 className="animate-spin" size={16} />);
Spinner.displayName = 'Spinner';

const IconButton = React.memo(({ 
  children, 
  onClick, 
  disabled = false, 
  tooltip, 
  'aria-label': ariaLabel,
  className = '' 
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <div className={`relative group ${className}`}>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel || tooltip}
        className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
      >
        {children}
      </button>
      <AnimatePresence>
        {tooltip && showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 text-white text-xs rounded-md px-2 py-1 pointer-events-none z-10"
          >
            {tooltip}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
IconButton.propTypes = { 
  children: PropTypes.node.isRequired, 
  onClick: PropTypes.func, 
  disabled: PropTypes.bool, 
  tooltip: PropTypes.string, 
  'aria-label': PropTypes.string,
  className: PropTypes.string 
};
IconButton.displayName = 'IconButton';


// --- MAIN COMPONENT DEFINITION ---
const AppContentComponent = ({ onShowLibrary, showStatus, isPending }) => {
  const { 
    state, 
    dispatch, 
    handleGenerateResponse, 
    handleSavePrompt, 
    handleNewPrompt 
  } = usePromptContext();
  
  const {
    promptTemplate, variables, apiResponse, responseHistory, isLoading, isSaving,
    temperature, provider, savedPrompts, selectedPromptId, promptName,
    progress, pollCount, activeProviderSettings
  } = state;
  
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const [fullViewResponse, setFullViewResponse] = useState(null);
  
  const handleConfirmClearHistory = useCallback(() => {
    dispatch({ type: 'CLEAR_HISTORY' });
    setShowClearHistoryConfirm(false);
    showStatus("History cleared.", "success");
  }, [dispatch, showStatus]);

  const finalPrompt = useMemo(() => {
    return variables.reduce((result, v) => {
      const placeholder = `{{${v.name}}}`;
      return result.split(placeholder).join(v.value || '');
    }, promptTemplate);
  }, [promptTemplate, variables]);

  const renderProviderSettings = useCallback(() => {
    if (provider === 'auto' || !activeProviderSettings || Object.keys(activeProviderSettings).length === 0) {
      return null;
    }
    return (
      <div className="mt-4 pt-4 border-t border-white/10">
        <h3 className="block text-sm font-medium text-gray-300 mb-2">
          {provider.charAt(0).toUpperCase() + provider.slice(1)} Settings
        </h3>
        <div className="space-y-3">
          {Object.entries(activeProviderSettings).map(([key, value]) => (
            <div key={key}>
              <label 
                htmlFor={`setting-${key}`}
                className="block text-xs font-medium text-gray-400 mb-1 capitalize"
              >
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </label>
              <input
                id={`setting-${key}`}
                type="number"
                value={value}
                onChange={(e) => dispatch({ 
                  type: 'UPDATE_PROVIDER_SETTING', 
                  payload: { key, value: parseFloat(e.target.value) }
                })}
                className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-2 text-gray-200 text-sm"
                min="0"
                max={key === 'maxTokens' ? 8192 : key.includes('P') ? 1 : 100}
                step={key.includes('P') || key.includes('K') ? 0.05 : 1}
                aria-label={`Adjust ${key} setting`}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }, [provider, activeProviderSettings, dispatch]);

  const handleCopyToClipboard = useCallback(async (text, successMessage) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showStatus(successMessage, "success");
    } catch (error) {
      showStatus("Failed to copy", "error");
    }
  }, [showStatus]);

  return (
    <div
      className="max-w-7xl mx-auto p-4 lg:p-6"
    >
      {/* Full View Modal for Response History */}
      <AnimatePresence>
        {fullViewResponse && (
          <motion.div 
            className="fixed inset-0 bg-black/90 backdrop-blur-lg z-[100] flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex justify-between items-center p-4 border-b border-white/10">
              <h2 className="text-xl font-bold text-white">
                Response from {fullViewResponse.provider}
              </h2>
              <div className="flex gap-2">
                <IconButton 
                  onClick={() => {
                    handleCopyToClipboard(fullViewResponse.text, 'Response copied!');
                  }}
                  tooltip="Copy response"
                  aria-label="Copy full response"
                >
                  <Copy size={20} />
                </IconButton>
                <IconButton 
                  onClick={() => setFullViewResponse(null)}
                  tooltip="Close"
                  aria-label="Close full view"
                >
                  <X size={20} />
                </IconButton>
              </div>
            </div>
            
            <div className="flex-grow overflow-y-auto p-4 md:p-8">
              <pre className="whitespace-pre-wrap break-words text-gray-200 text-base md:text-lg">
                {fullViewResponse.text}
              </pre>
            </div>
            
            <div className="p-4 border-t border-white/10 flex justify-center">
              <Button 
                onClick={() => {
                  dispatch({ type: 'SET_API_RESPONSE', payload: fullViewResponse });
                  setFullViewResponse(null);
                }}
                variant="primary"
                aria-label="Set as current response"
              >
                Set as Current Response
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div className="flex items-center gap-3 mb-4 sm:mb-0">
          <Sparkles className="w-8 h-8 text-yellow-400" />
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Promptmakers</h1>
        </div>
        <div className="flex items-center gap-2">
          <Suspense fallback={<div className="w-36 h-10 bg-gray-700 rounded-lg animate-pulse" />}>
            <Button 
              onClick={onShowLibrary} 
              variant="secondary" 
              aria-label="Open prompt library"
              disabled={isPending}
            >
              <Book size={16} /> My Library ({savedPrompts.length})
            </Button>
          </Suspense>
          <Suspense fallback={<div className="w-36 h-10 bg-indigo-600 rounded-lg animate-pulse" />}>
            <Button 
              onClick={() => handleNewPrompt(showStatus)} 
              aria-label="Create new prompt"
              disabled={isPending}
            >
              <Plus size={16} /> New Prompt
            </Button>
          </Suspense>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="flex flex-col gap-6">
          <Suspense fallback={<div className="h-72 bg-gray-800 rounded-xl animate-pulse" />}>
            <Card 
              title="AI Prompt Generator" 
              icon={<Wand2 className="text-indigo-400" />}
              aria-label="Prompt generator section"
            >
              <div className="relative">
                <textarea
                  value={promptTemplate}
                  onChange={(e) => {
                    dispatch({ type: 'SET_PROMPT_TEMPLATE', payload: e.target.value });
                  }}
                  className="w-full h-48 bg-gray-900/50 border border-white/10 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow font-mono text-sm leading-relaxed"
                  placeholder="e.g., Generate a creative tweet about {{product}}."
                  aria-label="Prompt template editor"
                />
                <div 
                  className="absolute bottom-4 right-4 bg-black/30 px-2 py-1 rounded text-xs text-gray-400"
                  aria-live="polite"
                >
                  {promptTemplate.length} chars
                </div>
              </div>
              
              <Button 
                onClick={() => handleGenerateResponse(finalPrompt, showStatus)} 
                disabled={isLoading || isPending} 
                className="w-full mt-4" 
                aria-label="Test prompt"
              >
                {isLoading ? <Spinner /> : <Sparkles size={16} />}
                {isLoading ? 'Generating...' : `Test with ${provider.charAt(0).toUpperCase() + provider.slice(1)}`}
              </Button>
            </Card>
          </Suspense>

          {variables.length > 0 && (
            <Suspense fallback={<div className="h-48 bg-gray-800 rounded-xl animate-pulse" />}>
              <Card 
                title="Variables" 
                icon={<ArrowRight className="text-green-400" />}
                aria-label="Prompt variables section"
              >
                <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
                  {variables.map((v, i) => (
                    <div key={v.name}>
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
                        onChange={(e) => {
                          const newVariables = [...variables];
                          newVariables[i].value = e.target.value;
                          dispatch({ type: 'SET_VARIABLES', payload: newVariables });
                        }}
                        placeholder={`Enter value for ${v.name}`}
                        className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-2 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        aria-label={`Value for ${v.name} variable`}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            </Suspense>
          )}
          
          <Suspense fallback={<div className="h-48 bg-gray-800 rounded-xl animate-pulse" />}>
            <Card 
              title="AI Configuration" 
              icon={<Settings className="text-gray-400" />}
              aria-label="AI configuration section"
            >
              <div className="space-y-4">
                <div>
                  <h3 className="block text-sm font-medium text-gray-300 mb-1.5">Model Provider</h3>
                  <div className="flex gap-2 flex-wrap">
                    {['auto', 'gemini', 'deepseek', 'test'].map(p => (
                      <Button 
                        key={p} 
                        onClick={() => dispatch({type: 'SET_PROVIDER', payload: p})}
                        variant={provider === p ? 'primary' : 'secondary'}
                        className="flex-1 min-w-[100px]"
                        aria-pressed={provider === p}
                        aria-label={`Select ${p} provider`}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </Button>
                    ))}
                  </div>
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
                    onChange={e => dispatch({ 
                      type: 'SET_TEMPERATURE', 
                      payload: parseFloat(e.target.value) 
                    })}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    aria-label="AI temperature setting"
                    aria-valuetext={`${Math.round(temperature * 100)}% creativity`}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>More Focused</span>
                    <span>More Creative</span>
                  </div>
                </div>
                
                {renderProviderSettings()}
              </div>
            </Card>
          </Suspense>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-6">
          <Suspense fallback={<div className="h-96 bg-gray-800 rounded-xl animate-pulse" />}>
            <Card 
              title="Latest AI Response" 
              icon={<Bot className="text-purple-400" />} 
              className="h-full flex flex-col"
              actions={
                <IconButton 
                  onClick={() => handleCopyToClipboard(apiResponse?.text, 'Response copied!')} 
                  disabled={!apiResponse?.text || isLoading} 
                  tooltip="Copy" 
                  aria-label="Copy AI response"
                >
                  <Copy size={16}/>
                </IconButton>
              }
              aria-label="AI response section"
            >
              {isLoading && (
                <div className="mb-2">
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500" 
                      initial={{ width: 0 }} 
                      animate={{ width: `${progress}%` }} 
                      transition={{ duration: 0.3 }} 
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1 text-right">
                    {pollCount > 0 ? `Processing... (${pollCount})` : 'Initializing...'}
                  </div>
                </div>
              )}
              
              <div 
                className="flex-grow h-full bg-gray-900/50 border-white/10 rounded-lg p-3 text-gray-200 overflow-y-auto prose prose-invert prose-sm max-w-none min-h-[20rem]" 
                aria-live="polite"
              >
                <AnimatePresence mode="wait">
                  {isLoading && progress < 100 ? (
                    <motion.div 
                      key="loading" 
                      className="flex items-center justify-center h-full text-gray-400"
                    >
                      <Loader2 className="animate-spin mr-2" /> 
                      <span>
                        {pollCount > 0 ? `Processing... (${pollCount})` : 'Waiting for response...'}
                      </span>
                    </motion.div>
                  ) : apiResponse ? (
                    <div 
                      key="response"
                    >
                      <div className="whitespace-pre-wrap">{apiResponse.text}</div>
                      {!apiResponse.error && (
                        <Suspense fallback={null}>
                          <PromptRating 
                            prompt={finalPrompt} 
                            source={provider} 
                            diagnostics={apiResponse.diagnostics} 
                          />
                        </Suspense>
                      )}
                    </div>
                  ) : (
                    <motion.p 
                      key="empty" 
                      className="text-gray-500 flex items-center justify-center h-full"
                    >
                      The AI's response will appear here.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </Card>
          </Suspense>

          <Suspense fallback={<div className="h-48 bg-gray-800 rounded-xl animate-pulse" />}>
            <Card 
              title="Response History" 
              icon={<History className="text-gray-400" />} 
              actions={
                <Button 
                  onClick={() => setShowClearHistoryConfirm(true)} 
                  variant="secondary" 
                  className="px-2 py-1 text-xs" 
                  disabled={responseHistory.length === 0 || isPending}
                  aria-label="Clear response history"
                >
                  Clear
                </Button>
              }
              aria-label="Response history section"
            >
              {responseHistory.length > 0 ? (
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {responseHistory.map((r, i) => (
                    <div 
                      key={r.id || r.timestamp || i}
                      className="group relative text-sm p-2 bg-white/5 rounded-md border border-white/10 text-gray-400 hover:bg-white/10 transition-colors cursor-pointer"
                      onClick={() => setFullViewResponse(r)}
                      aria-label={`View response from ${r.provider}`}
                    >
                      <div className="whitespace-pre-wrap break-words line-clamp-3">
                        {r.text}
                      </div>
                      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100">
                        <IconButton 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyToClipboard(r.text, 'Copied!');
                          }} 
                          aria-label="Copy response"
                        >
                          <Copy size={14} />
                        </IconButton>
                        <IconButton 
                          onClick={(e) => {
                            e.stopPropagation();
                            setFullViewResponse(r);
                          }}
                          aria-label="View full response"
                        >
                          <Maximize size={14} />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <p className="text-gray-500 text-sm text-center">Previous responses will be logged here.</p>
                </div>
              )}
            </Card>
          </Suspense>
        </div>
      </main>

      <motion.div className="mt-6">
        <Suspense fallback={<div className="h-16 bg-gray-800 rounded-xl animate-pulse" />}>
          <Card aria-label="Save prompt section">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative w-full">
                <Save className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  value={promptName} 
                  onChange={(e) => dispatch({ 
                    type: 'SET_PROMPT_NAME', 
                    payload: e.target.value 
                  })} 
                  className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-2 text-gray-200 focus:ring-2 focus:ring-indigo-500 pl-10" 
                  placeholder="Enter a name for this prompt..." 
                  aria-label="Prompt name" 
                />
              </div>
              <Button 
                onClick={() => handleSavePrompt(showStatus)} 
                disabled={isSaving || !promptName || isPending} 
                className="w-full sm:w-auto" 
                aria-label="Save prompt to library"
              >
                {isSaving ? <Spinner /> : <Save size={16} />}
                {isSaving ? 'Saving...' : selectedPromptId ? 'Update Prompt' : 'Save to Library'}
              </Button>
            </div>
          </Card>
        </Suspense>
      </motion.div>

      <AnimatePresence>
        {showClearHistoryConfirm && (
          <motion.div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
            role="dialog" 
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className="bg-gray-800 border border-white/10 rounded-xl w-full max-w-md shadow-2xl"
              initial={{ scale: 0.9, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="p-6 text-center">
                <History className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white">Clear Response History?</h3>
                <p className="text-gray-400 mt-2">
                  Are you sure you want to clear all {responseHistory.length} responses? 
                  This action cannot be undone.
                </p>
              </div>
              <div className="flex justify-end gap-3 p-4 bg-gray-900/50 rounded-b-xl">
                <Button 
                  onClick={() => setShowClearHistoryConfirm(false)} 
                  variant="secondary"
                  aria-label="Cancel clear history"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmClearHistory} 
                  variant="danger"
                  aria-label="Confirm clear history"
                >
                  Clear History
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- PROP TYPES AND EXPORT ---

AppContentComponent.propTypes = {
  onShowLibrary: PropTypes.func.isRequired,
  showStatus: PropTypes.func.isRequired,
  isPending: PropTypes.bool,
};

export default React.memo(AppContentComponent);