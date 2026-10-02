export const FIRST_ADDED: string;
export const BORROWED_TOPIC: string;
export const TOPIC_TARGET: number;
export interface Report {
  errors: string[];
  warnings: string[];
}
export function validateTopics(topics: unknown): Report;
export function validateWords(words: unknown, topics?: { id: string }[]): Report;
