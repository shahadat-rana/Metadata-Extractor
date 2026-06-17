import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign WebSocket connection/closing errors caused by HMR constraints in the sandbox environment
if (typeof window !== 'undefined') {
  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason) {
      const message = typeof reason === 'string' ? reason : (reason.message || '');
      if (
        message.includes('WebSocket') || 
        message.includes('websocket') || 
        message.includes('connection')
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }
  }, true);

  // Catch general window errors
  window.addEventListener('error', (event) => {
    const message = event.message || '';
    const errMessage = (event.error && event.error.message) || '';
    if (
      message.includes('WebSocket') || 
      message.includes('websocket') || 
      message.includes('HMR') ||
      errMessage.includes('WebSocket') || 
      errMessage.includes('websocket')
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);

  // Intercept console.error to avoid raising scary red flags for benign Vite WebSocket connection failures
  const originalConsoleError = console.error;
  console.error = function (...args) {
    const firstArg = args[0];
    if (typeof firstArg === 'string') {
      if (
        firstArg.includes('failed to connect to websocket') ||
        firstArg.includes('WebSocket connection to') ||
        firstArg.includes('WebSocket closed without opened')
      ) {
        return; // Suppressed silently
      }
    }
    originalConsoleError.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

