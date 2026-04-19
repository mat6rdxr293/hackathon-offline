import React from 'react';
import ReactDOM from 'react-dom/client';

import { I18nProvider } from '../i18n/provider';
import { App } from './App';
import '../styles/tailwind.css';

const PANEL_READY_SOURCE = 'medflow-panel';
const PANEL_READY_TYPE = 'ready';

const getOrCreateRoot = (): HTMLElement => {
  const existing = document.getElementById('root');
  if (existing) {
    return existing;
  }

  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  return root;
};

const notifyParentReady = (): void => {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage(
    {
      source: PANEL_READY_SOURCE,
      type: PANEL_READY_TYPE,
    },
    '*',
  );
};

ReactDOM.createRoot(getOrCreateRoot()).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);

requestAnimationFrame(() => {
  notifyParentReady();
  // extra pings handle race conditions with listener attachment in content script
  window.setTimeout(notifyParentReady, 120);
  window.setTimeout(notifyParentReady, 500);
  window.setTimeout(notifyParentReady, 1200);
});

window.addEventListener('error', () => {
  notifyParentReady();
});
