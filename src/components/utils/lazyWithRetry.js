import React from 'react';

const lazyWithRetry = (componentImport, maxRetries = 3, baseDelay = 1000) => {
  return React.lazy(async () => {
    let retries = 0;
    
    while (retries <= maxRetries) {
      try {
        const module = await componentImport();
        return { default: module.default };
      } catch (error) {
        if (retries++ < maxRetries) {
          const delay = baseDelay * Math.pow(2, retries);
          console.warn(`Lazy loading failed (attempt ${retries}/${maxRetries}), retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('Lazy loading failed after maximum retries', error);
          
          // Create a custom error boundary fallback
          return {
            default: () => (
              <div className="p-6 bg-red-900/30 rounded-xl border border-red-500/50">
                <h3 className="text-lg font-bold text-red-200 mb-2">Component Load Failed</h3>
                <p className="text-red-100 mb-4">
                  We couldn't load this part of the application. 
                  Please check your connection and try again.
                </p>
                <button 
                  className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-md text-white"
                  onClick={() => window.location.reload()}
                >
                  Reload Application
                </button>
              </div>
            )
          };
        }
      }
    }
  });
};

export default lazyWithRetry;