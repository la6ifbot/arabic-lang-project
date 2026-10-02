import raw from '../data/topics.json';
import type { Topic } from '../types';
import { WORDS } from './words';

/** "The whole sea": every word. It is the absence of a topic, so it isn't in topics.json. */
export const WHOLE_SEA = { en: 'The whole sea', ar: 'البحر كله' } as const;

/** What the site gets of a topic: the build leaves the descriptions out (vite.config.ts). */
export type SeaTopic = Omit<Topic, 'description'>;

/** Topics that have words, in picker order. An empty topic never shows until it has words. */
export const TOPICS: SeaTopic[] = [...(raw as SeaTopic[])]
  .sort((a, b) => a.order - b.order)
  .filter((t) => WORDS.some((w) => w.topics.includes(t.id)));

export const TOPIC_BY_ID: ReadonlyMap<string, SeaTopic> = new Map(TOPICS.map((t) => [t.id, t]));

export const isTopic = (id: unknown): id is string => typeof id === 'string' && TOPIC_BY_ID.has(id);

/** The slugs in a topic (or every slug for the whole sea), in data order. */
export function topicSlugs(topic: string | null): string[] {
  return WORDS.filter((w) => !topic || w.topics.includes(topic)).map((w) => w.slug);
}

export const topicPath = (topic: string | null) => (topic ? `/sea/${topic}` : '/');
