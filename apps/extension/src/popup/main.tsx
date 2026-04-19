import React from 'react';
import ReactDOM from 'react-dom/client';

import { I18nProvider } from '../i18n/provider';
import '../styles/tailwind.css';
import { PopupApp } from './PopupApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <PopupApp />
    </I18nProvider>
  </React.StrictMode>,
);
