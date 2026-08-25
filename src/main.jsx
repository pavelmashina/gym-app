import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './auth.css';
import './training-icon-tabs.css';
import './training-icon-tabs-adjustments.css';
import './create-program-schedule-scroll-fix.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
