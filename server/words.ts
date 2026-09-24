import words from '../src/data/words.json' with { type: 'json' };
import type { EmailWord } from './email/templates.js';

/** The same static word list the site ships. */
export const WORDS = words as (EmailWord & { added?: string })[];
