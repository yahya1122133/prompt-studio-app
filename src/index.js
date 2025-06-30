import './polyfills';  // Must be first
import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import { PromptProvider } from './PromptContext';

ReactDOM.render(
  <PromptProvider>
    <App />
  </PromptProvider>,
  document.getElementById('root')
);

// Modern polyfill loader - only loads what's needed
if (typeof window !== 'undefined') {
  const neededPolyfills = []
  if (!window.Promise) neededPolyfills.push(import('core-js/stable/promise'))
  if (!window.fetch) neededPolyfills.push(import('whatwg-fetch'))
  if (!window.Set) neededPolyfills.push(import('core-js/stable/set'))
  
  Promise.all(neededPolyfills).then(() => {
    console.log('Polyfills loaded:', neededPolyfills.length)
  })
}