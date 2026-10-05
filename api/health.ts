import { healthRoute } from '../server/deps.js';
import { handlePublicHealth } from '../server/handlers.js';

// Public, for the external uptime monitor: 200 {"ok":true} or 503 {"ok":false}, nothing more.
export const GET = healthRoute(handlePublicHealth);
export const HEAD = healthRoute(handlePublicHealth);
