import React, { useState } from 'react';
import { usePromptContext } from './PromptContext';
import PropTypes from 'prop-types'; // Added for prop validation

const PromptRating = ({ prompt, source, initialRating = 0 }) => {
  const { dispatch } = usePromptContext();
  const [rating, setRating] = useState(initialRating);
  const [isRated, setIsRated] = useState(false);

  const handleRating = (star) => {
    if (isRated) return;
    
    setRating(star);
    setIsRated(true);
    
    // Dispatch performance tracking
    dispatch({
      type: 'TRACK_PROMPT_PERFORMANCE',
      payload: { 
        prompt, 
        source, 
        rating: star,
        timestamp: new Date().toISOString() 
      }
    });

    // Only learn from high ratings
    if (star >= 4) {
      dispatch({
        type: 'LEARN_FROM_SUCCESS',
        payload: {
          prompt,
          rating: star,
          context: { source }
        }
      });
    }
  };

  return (
    <div className="flex items-center gap-1 mt-2" role="group" aria-label="Rate this prompt">
      <span className="text-xs text-gray-400">Rate:</span>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => handleRating(star)}
          className={`text-lg transition-transform focus:outline-none ${
            isRated 
              ? 'cursor-default' 
              : 'hover:scale-125 active:scale-110'
          } ${
            star <= rating ? 'text-yellow-400' : 'text-gray-300'
          }`}
          aria-label={`Rate ${star} stars`}
          disabled={isRated}
          aria-pressed={star <= rating}
        >
          {star <= rating ? '⭐' : '☆'}
        </button>
      ))}
      {isRated && (
        <span 
          className="text-xs text-green-400 ml-2 animate-fade-in"
          aria-live="polite"
        >
          Thank you!
        </span>
      )}
    </div>
  );
};

PromptRating.propTypes = {
  prompt: PropTypes.string.isRequired,
  source: PropTypes.string.isRequired,
  initialRating: PropTypes.number
};

export default PromptRating;