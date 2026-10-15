import { route } from '../server/deps.js';
import { handleConfirm } from '../server/handlers.js';

export const POST = route(handleConfirm, 'confirm');
