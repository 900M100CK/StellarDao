import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { AppProvider } from './context/AppContext.jsx';
import { loadAppConfig } from './config/appConfig';

loadAppConfig()
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <AppProvider>
          <App />
        </AppProvider>
      </React.StrictMode>
    );
  })
  .catch((err) => {
    document.body.innerHTML = `<div style="padding:2rem;font-family:sans-serif;color:#b91c1c"><h2>Configuration Error</h2><p>${err.message}</p><p>Run: <code>node scripts/setup-demo.js</code> then <code>cd frontend && npm run dev</code></p></div>`;
  });