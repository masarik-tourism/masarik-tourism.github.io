import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './contexts/LanguageContext';
import { AdminProvider } from './contexts/AdminContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { runStartupBuildCleanup } from './utils/cacheCleanup';
import './index.css';

runStartupBuildCleanup();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <AdminProvider>
          <App />
        </AdminProvider>
      </LanguageProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
