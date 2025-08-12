// src/index.js
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Simple loader component
const FullPageLoader = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
    <div className="w-16 h-16 border-4 border-t-indigo-500 border-gray-700 rounded-full animate-spin mb-4"></div>
    <p className="text-lg">Loading Promptmakers</p>
    <p className="text-gray-400 text-sm mt-2">Preparing your AI studio</p>
  </div>
);

// Error boundary component
const ErrorFallback = ({ error, retry }) => (
  <div className="flex flex-col items-center justify-center h-screen bg-red-900 text-white p-4 text-center">
    <h1 className="text-2xl font-bold mb-2">Application Error</h1>
    <p className="mb-4">Something went wrong. Please try refreshing the page.</p>
    <details className="mb-4 text-sm text-left max-w-md">
      <summary className="cursor-pointer mb-2">Error Details</summary>
      <pre className="bg-red-800 p-2 rounded text-xs overflow-auto">
        {error?.message || 'Unknown error'}
      </pre>
    </details>
    <button 
      className="px-4 py-2 bg-white text-red-900 rounded-md font-medium hover:bg-gray-100 transition-colors"
      onClick={retry}
    >
      Reload Application
    </button>
  </div>
);

// Main render function
const renderApp = () => {
  const container = document.getElementById('root');
  if (!container) {
    console.error('Root container not found');
    return;
  }

  const root = createRoot(container);

  try {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  } catch (error) {
    console.error('Application render failed:', error);
    root.render(
      <ErrorFallback 
        error={error} 
        retry={() => window.location.reload()} 
      />
    );
  }
};

// Enhanced error handling
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Start the application
renderApp();

// PWA Registration (optional - only if service worker exists)
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', async () => {
    try {
      // Check if service worker file exists and has correct MIME type
      const response = await fetch('/service-worker.js', { 
        method: 'HEAD',
        cache: 'no-cache'
      });
      
      if (!response.ok || !response.headers.get('content-type')?.includes('javascript')) {
        console.log('Service worker not found or invalid, skipping registration');
        return;
      }
      
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('ServiceWorker registered successfully:', registration.scope);
      
      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content is available, show update notification
              if (confirm('New version available. Reload to update?')) {
                window.location.reload();
              }
            }
          });
        }
      });
    } catch (error) {
      // Silently fail for service worker issues
      console.log('ServiceWorker registration skipped:', error.message);
    }
  });
}