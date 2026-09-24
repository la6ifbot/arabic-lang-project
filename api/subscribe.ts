import { route } from '../server/deps.js';
import { handleSubscribe } from '../server/handlers.js';

export const POST = route(handleSubscribe);
