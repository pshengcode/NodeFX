import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Suppress benign ResizeObserver errors common in React Flow / layout heavy apps
// These errors are usually safe to ignore in this context as they just mean 
// the browser couldn't paint a frame immediately after a resize.
const originalError = console.error;
console.error = (...args) => {
  if (args.length > 0 && typeof args[0] === 'string') {
    // Check for various ResizeObserver error messages
    if (args[0].includes('ResizeObserver loop') || 
        args[0].includes('ResizeObserver loop limit exceeded') ||
        args[0].includes('ResizeObserver loop completed with undelivered notifications')) {
      return;
    }
  }
  originalError(...args);
};

// Use capture phase to catch errors before they bubble up to other listeners or default handlers
window.addEventListener('error', (e) => {
  const msg = e.message;
  // Check for various ResizeObserver error messages
  if (typeof msg === 'string' && (
    msg.includes('ResizeObserver loop') || 
    msg.includes('ResizeObserver loop limit exceeded') ||
    msg.includes('ResizeObserver loop completed with undelivered notifications')
  )) {
    e.stopImmediatePropagation();
    e.preventDefault(); // Sometimes needed to prevent console output in strict environments
  }
}, { capture: true });

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
