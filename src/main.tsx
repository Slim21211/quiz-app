import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { getStaticRouteUrl } from './lib/staticRoute';
import './index.css';

const restoredRoute = getStaticRouteUrl(window.location.href);
if (restoredRoute) window.history.replaceState(window.history.state, '', restoredRoute);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Application root is missing');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
