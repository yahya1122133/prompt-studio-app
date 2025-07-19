// src/components/features/PromptLibrary.js
import React, { useState, startTransition, useMemo } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Book, Copy, Trash2, X } from 'lucide-react';
import Button from '../ui/Button';
import { usePromptContext } from '../../context/PromptContext';

const PromptLibrary = ({ 
  onClose, 
  onSelectDelete,
  showStatus
}) => {
  const { state, dispatch } = usePromptContext();
  const { savedPrompts, librarySearchTerm } = state;
  
  const filteredPrompts = useMemo(() => {
    if (!savedPrompts) return [];
    if (!librarySearchTerm) return savedPrompts;
    
    return savedPrompts.filter(prompt => 
      prompt.name.toLowerCase().includes(librarySearchTerm.toLowerCase()) ||
      prompt.template.toLowerCase().includes(librarySearchTerm.toLowerCase())
    );
  }, [savedPrompts, librarySearchTerm]);
  const [localSearchTerm, setLocalSearchTerm] = useState(librarySearchTerm || '');

  const handleSearch = (e) => {
    const value = e.target.value;
    setLocalSearchTerm(value);
    startTransition(() => {
      dispatch({ type: 'SET_LIBRARY_SEARCH', payload: value });
    });
  };

  const handlePromptSelect = (prompt) => {
    startTransition(() => {
      dispatch({ type: 'SET_PROMPT_TEMPLATE', payload: prompt.template });
      dispatch({ type: 'SET_VARIABLES', payload: prompt.variables || [] });
      dispatch({ type: 'SET_PROMPT_NAME', payload: prompt.name });
      onClose();
    });
  };

  const handleDeleteClick = (promptId) => {
    startTransition(() => {
      onSelectDelete(promptId);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-gray-800 border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-xl font-semibold text-white">Prompt Library</h3>
          <button 
            onClick={onClose}
            className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
            aria-label="Close library"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search library..."
              value={localSearchTerm}
              onChange={handleSearch}
              className="w-full bg-gray-900/50 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-gray-200 focus:ring-2 focus:ring-indigo-500"
              aria-label="Search prompts"
            />
          </div>
        </div>
        
        <div className="p-4 max-h-[50vh] overflow-y-auto">
          {filteredPrompts.length > 0 ? (
            <ul className="space-y-2">
              {filteredPrompts.map(prompt => (
                <li
                  key={prompt.id}
                  className="group flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                  onClick={() => handlePromptSelect(prompt)}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{prompt.name}</p>
                    <p className="text-xs text-gray-400 truncate">{prompt.template}</p>
                  </div>
                  <div className="flex gap-1 pl-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(prompt.template);
                        showStatus('Template copied to clipboard', 'success');
                      }}
                      className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
                      aria-label={`Copy prompt: ${prompt.name}`}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(prompt.id);
                      }}
                      className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-red-400 hover:text-red-300 transition-colors"
                      aria-label={`Delete prompt: ${prompt.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Book size={40} className="mx-auto mb-2" />
              <p>No prompts found.</p>
              {localSearchTerm && <p className="text-sm mt-1">Try a different search term.</p>}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

PromptLibrary.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSelectDelete: PropTypes.func.isRequired,
  showStatus: PropTypes.func.isRequired
};

export default PromptLibrary; 