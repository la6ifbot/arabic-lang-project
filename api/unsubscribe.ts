import { route } from '../server/deps.js';
import { handleUnsubscribe } from '../server/handlers.js';

// POST only: one-click unsubscribe (RFC 8058) and the unsubscribe page. A GET never changes anything,
// so link scanners in mail systems can't unsubscribe people by accident.
export const POST = route(handleUnsubscribe);
