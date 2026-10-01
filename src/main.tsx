import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './lib/fonts';
import './styles.css';
import { App } from './App';
import { startMusic } from './lib/music';
import { slugFromLocation } from './lib/router';
import { initialOrder, useDurar } from './state/store';

useDurar.setState({ order: initialOrder(slugFromLocation()) });

startMusic();

// The prerendered SEO copy of a word page is replaced by the live, accessible mirror.
document.getElementById('seo-word')?.remove();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
