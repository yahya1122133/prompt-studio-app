// (or inside your PromptRating code in App.js)

<button
  key={star}
  onClick={() => {
    setRating(star);
    dispatch({
      type: 'TRACK_PROMPT_PERFORMANCE',
      payload: { prompt, source, rating: star }
    });
    if (star >= 4) {
      dispatch({
        type: 'LEARN_FROM_SUCCESS',
        payload: prompt // or selectedPrompt if you have it in scope
      });
    }
  }}
  className="text-lg focus:outline-none"
  aria-label={`Rate ${star} stars`}
>
  {star <= rating ? '⭐' : '☆'}
</button>