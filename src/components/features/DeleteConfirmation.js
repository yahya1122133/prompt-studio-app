import React, { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, X } from 'lucide-react';
import PropTypes from 'prop-types';
import Button from '../ui/Button';

export function DeleteConfirmation({ onConfirm, onCancel, promptName = "this prompt" }) {
  const confirmRef = useRef(null);
  const containerRef = useRef(null);
  
  // Handle escape key press
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onCancel();
  }, [onCancel]);

  // Focus trap and keyboard navigation
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    confirmRef.current?.focus();
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === containerRef.current) {
      onCancel();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-gray-800 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden"
        >
          <div className="flex justify-between items-center p-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">Confirm Deletion</h2>
            <button 
              onClick={onCancel}
              className="p-1 rounded-full hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-red-900/30 rounded-full">
                <Trash2 className="w-10 h-10 text-red-400" />
              </div>
            </div>
            
            <h3 className="text-xl font-semibold text-white mb-2">Delete "{promptName}"?</h3>
            <p className="text-gray-400">
              This will permanently remove the prompt from your library. 
              This action cannot be undone.
            </p>
          </div>
          
          <div className="flex justify-end gap-3 p-4 bg-gray-900/50">
            <Button 
              onClick={onCancel} 
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              ref={confirmRef}
              onClick={onConfirm} 
              variant="danger"
              className="flex-1"
            >
              <Trash2 size={18} className="mr-2" />
              Delete
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

DeleteConfirmation.propTypes = {
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  promptName: PropTypes.string
};

DeleteConfirmation.defaultProps = {
  promptName: "this prompt"
};

export default DeleteConfirmation;