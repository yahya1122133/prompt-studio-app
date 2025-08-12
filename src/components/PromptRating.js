import React, { useState, useEffect, useCallback } from 'react';
import { usePromptContext } from '../context/PromptContext';
import PropTypes from 'prop-types';
import { Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PromptRating = ({ prompt, source = 'unknown', initialRating = 0 }) => {
  const { dispatch } = usePromptContext();
  const [rating, setRating] = useState(initialRating);
  const [isRated, setIsRated] = useState(false);

  // Initialize from localStorage
  useEffect(() => {
    const savedRating = localStorage.getItem(`rated-${prompt}`);
    if (savedRating) {
      setRating(Number(savedRating));
      setIsRated(true);
    }
  }, [prompt]);

  const handleRating = useCallback((star) => {
    if (isRated) return;
    
    setRating(star);
    setIsRated(true);
    
    // Save to localStorage
    localStorage.setItem(`rated-${prompt}`, star.toString());
    
    dispatch({
      type: 'TRACK_PROMPT_PERFORMANCE',
      payload: { 
        prompt, 
        source, 
        rating: star,
        timestamp: new Date().toISOString() 
      }
    });

    if (star >= 4) {
      dispatch({
        type: 'LEARN_FROM_SUCCESS',
        payload: prompt
      });
    }
  }, [isRated, prompt, source, dispatch]);

  const handleKeyDown = (e, star) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleRating(star);
    }
  };

  return (
    <div className="flex items-center gap-1 mt-4 pt-4 border-t border-gray-700">
      <span className="text-xs text-gray-400">Rate this prompt:</span>
      <div className="flex" role="group" aria-label="Prompt rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRating(star)}
            onKeyDown={(e) => handleKeyDown(e, star)}
            className={`p-1 transition-transform focus:outline-none ${
              isRated 
                ? 'cursor-default' 
                : 'hover:scale-125 focus:scale-125'
            }`}
            aria-label={`${star} stars`}
            aria-pressed={star <= rating}
            disabled={isRated}
            tabIndex={isRated ? -1 : 0}
          >
            {star <= rating ? (
              <Star size={16} fill="currentColor" className="text-yellow-400" />
            ) : (
              <Star size={16} className="text-gray-400" />
            )}
          </button>
        ))}
      </div>
      
      <AnimatePresence>
        {isRated && (
          <motion.span
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xs text-green-400 ml-2"
            aria-live="polite"
          >
            Thanks for your feedback!
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};

PromptRating.propTypes = {
  prompt: PropTypes.string.isRequired,
  source: PropTypes.string,
  initialRating: PropTypes.number
};

// defaultProps removed in favor of default parameters

export default PromptRating;