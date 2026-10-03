import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './lib/fonts';
import './styles.css';
import { App } from './App';
import { slugFromLocation, topicFromPath } from './lib/router';
import { initialOrder, topicOrder, useDurar } from './state/store';
import { rememberedTopic } from './state/topic';

// /sea/<topic> opens that topic; a plain visit to / opens the remembered one (today's pearl still
// comes first); a shared /word/<slug> link always opens the whole sea on that word.
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const slug = slugFromLocation();
const linked = topicFromPath(path);
const topic = slug ? null : (linked ?? (path === '/' || path === '/index.html' ? rememberedTopic() : null));
useDurar.setState({ topic, order: linked ? topicOrder(linked) : initialOrder(slug, topic) });

// The prerendered SEO copy of a word page is replaced by the live, accessible mirror.
document.getElementById('seo-word')?.remove();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
