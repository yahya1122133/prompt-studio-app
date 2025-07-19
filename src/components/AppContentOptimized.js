// src/components/AppContentOptimized.js
// Optimized version with reduced Framer Motion usage

import React, { useMemo, useState, useCallback, lazy, Suspense } from 'react';
import { 
  ArrowRight, Book, Bot, Copy, History, 
  Loader2, Save, Settings, 
  Wand2, Plus, Sparkles 
} from 'lucide-react';
import PropTypes from 'prop-types';
import { usePromptContext } from '../context/PromptContext';

// Lazy load child components
const Button = lazy(() => import('./ui/Button'));
const Card = lazy(() => import('./ui/Card'));
const PromptRating = lazy(() => import('./PromptRating'));

// Lightweight components without Framer Motion
const Spinner = React.memo(() => <Loader2 className="animate-spin" size={16} />);
Spinner.displayName = 'Spinner';

const IconButton = React.memo(({ children, onClick, disabled = false, tooltip, 'aria-label': ariaLabel }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <div className="relative group">
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
      {tooltip && showTooltip && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 text-white text-xs rounded-md px-2 py-1 pointer-events-none z-10 opacity-100 transition-opacity">
          {tooltip}
        </div>
      )}
    </div>
  );
});

IconButton.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  tooltip: PropTypes.string,
  'aria-label': PropTypes.string
};
IconButton.displayName = 'IconButton';

// Main component
const AppContentOptimized = ({ 
  onLibraryClick, 
  onDeleteClick, 
  onShowStatus 
}) => {
  const { 
    state, 
    generatePrompt, 
    clearOutput, 
    clearHistory, 
    saveToHistory,
    copyToClipboard,
    updateProvider,
    updateTemperature,
    updateInput
  } = usePromptContext();

  const {
    input = '',
    output = '',
    isGenerating = false,
    provider = 'auto',
    temperature = 0.7,
    history = []
  } = state;

  // Memoized handlers
  const handleGenerate = useCallback(async () => {
    if (!input.trim() || isGenerating) return;
    try {
      await generatePrompt();
    } catch (error) {
      onShowStatus?.('Generation failed. Please try again.', 'error');
    }
  }, [input, isGenerating, generatePrompt, onShowStatus]);

  const handleCopy = useCallback(async () => {
    if (!output.trim()) return;
    try {
      await copyToClipboard(output);
      onShowStatus?.('Output copied to clipboard!', 'success');
    } catch (error) {
      onShowStatus?.('Failed to copy output', 'error');
    }
  }, [output, copyToClipboard, onShowStatus]);

  const handleSave = useCallback(() => {
    if (!output.trim()) return;
    try {
      saveToHistory();
      onShowStatus?.('Prompt saved to history!', 'success');
    } catch (error) {
      onShowStatus?.('Failed to save prompt', 'error');
    }
  }, [output, saveToHistory, onShowStatus]);

  const handleClearHistory = useCallback(() => {
    onDeleteClick?.({
      type: 'history',
      confirmText: `Clear all ${history.length} items from history?`,
      onConfirm: () => {
        clearHistory();
        onShowStatus?.('History cleared successfully', 'success');
      }
    });
  }, [history.length, clearHistory, onDeleteClick, onShowStatus]);

  // Memoized calculations
  const canGenerate = useMemo(() => 
    Boolean(input.trim()) && !isGenerating, 
    [input, isGenerating]
  );

  const hasOutput = useMemo(() => 
    Boolean(output.trim()), 
    [output]
  );

  const hasHistory = useMemo(() => 
    history.length > 0, 
    [history.length]
  );

  const historyStats = useMemo(() => ({
    total: history.length,
    recent: history.slice(0, 3),
    averageRating: history.reduce((sum, item) => sum + (item.rating || 0), 0) / history.length || 0
  }), [history]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4 flex items-center justify-center gap-3">
            <Wand2 className="h-10 w-10 text-purple-300" />
            Prompt Studio
          </h1>
          <p className="text-purple-200 text-lg">
            Create, enhance, and perfect your AI prompts
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
          {/* Input Section */}
          <Suspense fallback={<div className="animate-pulse bg-white/10 rounded-xl h-96"></div>}>
            <Card className="h-fit">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Bot className="h-5 w-5 text-purple-300" />
                    Input Prompt
                  </h2>
                  <div className="flex gap-2">
                    <IconButton
                      onClick={onLibraryClick}
                      tooltip="Browse Library"
                      aria-label="Browse prompt library"
                    >
                      <Book size={16} />
                    </IconButton>
                    <IconButton
                      onClick={() => updateInput('')}
                      disabled={!input.trim()}
                      tooltip="Clear Input"
                      aria-label="Clear input"
                    >
                      <Loader2 size={16} />
                    </IconButton>
                  </div>
                </div>

                <textarea
                  value={input}
                  onChange={(e) => updateInput(e.target.value)}
                  placeholder="Enter your prompt here..."
                  className="w-full h-48 p-4 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  maxLength="1500"
                />

                <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
                  <span>{input.length}/1500 characters</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      Provider:
                      <select
                        value={provider}
                        onChange={(e) => updateProvider(e.target.value)}
                        className="bg-white/10 border border-white/20 rounded px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="auto">Auto (Enhanced)</option>
                        <option value="gemini">Gemini</option>
                        <option value="deepseek">DeepSeek</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2">
                      Creativity:
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => updateTemperature(parseFloat(e.target.value))}
                        className="w-20"
                      />
                      <span className="w-8 text-xs">{temperature}</span>
                    </label>
                  </div>
                </div>

                <div className="mt-6">
                  <Suspense fallback={<div className="animate-pulse bg-purple-600/50 rounded-lg h-12"></div>}>
                    <Button
                      onClick={handleGenerate}
                      disabled={!canGenerate}
                      className="w-full btn-primary"
                    >
                      {isGenerating ? (
                        <>
                          <Spinner />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          Generate Enhanced Prompt
                          <ArrowRight size={16} />
                        </>
                      )}
                    </Button>
                  </Suspense>
                </div>
              </div>
            </Card>
          </Suspense>

          {/* Output Section */}
          <Suspense fallback={<div className="animate-pulse bg-white/10 rounded-xl h-96"></div>}>
            <Card className="h-fit">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <ArrowRight className="h-5 w-5 text-green-400" />
                    Enhanced Output
                  </h2>
                  <div className="flex gap-2">
                    <IconButton
                      onClick={handleCopy}
                      disabled={!hasOutput}
                      tooltip="Copy Output"
                      aria-label="Copy output to clipboard"
                    >
                      <Copy size={16} />
                    </IconButton>
                    <IconButton
                      onClick={handleSave}
                      disabled={!hasOutput}
                      tooltip="Save to History"
                      aria-label="Save to history"
                    >
                      <Save size={16} />
                    </IconButton>
                    <IconButton
                      onClick={clearOutput}
                      disabled={!hasOutput}
                      tooltip="Clear Output"
                      aria-label="Clear output"
                    >
                      <Loader2 size={16} />
                    </IconButton>
                  </div>
                </div>

                <div className="min-h-48 p-4 bg-white/5 border border-white/10 rounded-lg">
                  {hasOutput ? (
                    <div className="space-y-4">
                      <div className="text-white whitespace-pre-wrap break-words">
                        {output}
                      </div>
                      <Suspense fallback={<div className="animate-pulse bg-white/10 rounded h-8"></div>}>
                        <PromptRating />
                      </Suspense>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-gray-400">
                      {isGenerating ? (
                        <div className="flex items-center gap-3">
                          <Spinner />
                          <span>Generating enhanced prompt...</span>
                        </div>
                      ) : (
                        <span>Your enhanced prompt will appear here</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </Suspense>
        </div>

        {/* History Section */}
        {hasHistory && (
          <div className="mt-8 max-w-7xl mx-auto">
            <Suspense fallback={<div className="animate-pulse bg-white/10 rounded-xl h-48"></div>}>
              <Card>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                      <History className="h-5 w-5 text-blue-400" />
                      Recent History ({historyStats.total})
                    </h2>
                    <div className="flex gap-2">
                      <IconButton
                        onClick={onLibraryClick}
                        tooltip="View All History"
                        aria-label="View all history"
                      >
                        <Book size={16} />
                      </IconButton>
                      <IconButton
                        onClick={handleClearHistory}
                        tooltip="Clear History"
                        aria-label="Clear all history"
                      >
                        <Loader2 size={16} />
                      </IconButton>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {historyStats.recent.map((item, index) => (
                      <div
                        key={`history-${item.id || index}`}
                        className="p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm line-clamp-3 mb-2">
                              {item.text}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                              <span>
                                {new Date(item.timestamp).toLocaleDateString()}
                              </span>
                              {item.rating && (
                                <span className="flex items-center gap-1">
                                  <span>★</span> {item.rating}/5
                                </span>
                              )}
                            </div>
                          </div>
                          <IconButton
                            onClick={() => updateInput(item.text)}
                            tooltip="Use This Prompt"
                            aria-label="Use this prompt"
                          >
                            <Plus size={14} />
                          </IconButton>
                        </div>
                      </div>
                    ))}
                  </div>

                  {historyStats.averageRating > 0 && (
                    <div className="mt-4 text-center text-sm text-gray-400">
                      Average Rating: ★ {historyStats.averageRating.toFixed(1)}/5
                    </div>
                  )}
                </div>
              </Card>
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
};

AppContentOptimized.propTypes = {
  onLibraryClick: PropTypes.func,
  onDeleteClick: PropTypes.func,
  onShowStatus: PropTypes.func
};

export default AppContentOptimized;
