import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { isDue } from '../../shared/mastery';
import { WORD_BY_SLUG } from '../lib/words';
import { useProgress } from '../state/progress';
import { EXIT_MS, sceneCards, useDurar } from '../state/store';
import { Layout } from './layout';
import { PearlCard } from './PearlCard';

export function CardField({ visibleCount, reducedMotion }: { visibleCount: number; reducedMotion: boolean }) {
  const order = useDurar((s) => s.order);
  const topic = useDurar((s) => s.topic);
  const departures = useDurar((s) => s.departures);
  const progress = useProgress((s) => s.map);
  const drifting = useRef<string[]>([]);
  const layout = useMemo(() => new Layout(), []);
  const size = useThree((s) => s.size);
  layout.update(size.width, size.height);

  useFrame(({ size: sz }) => layout.update(sz.width, sz.height));

  // Unmount sunk cards once their exit animation has played out.
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!departures.length) return;
    const oldest = Math.min(...departures.map((d) => d.at));
    const id = window.setTimeout(force, Math.max(0, oldest + EXIT_MS - performance.now()) + 50);
    return () => window.clearTimeout(id);
  }, [departures, force]);

  // Let the background pearls drift in one at a time: prettier, and it spreads texture/shader work
  // across frames instead of one long main-thread task at startup.
  const [limit, setLimit] = useState(1);
  useEffect(() => {
    if (limit >= visibleCount) return;
    const id = window.setTimeout(() => setLimit((l) => l + 1), limit === 1 ? 500 : 140);
    return () => window.clearTimeout(id);
  }, [limit, visibleCount]);

  const now = performance.now();
  const visible = order.slice(0, Math.min(limit, visibleCount));
  const cards = visible.map((slug, i) => ({ slug, index: i, departAt: undefined as number | undefined }));
  const departing = departures.filter((d) => now - d.at < EXIT_MS && !visible.includes(d.slug));

  // Known words that aren't due drift low in the background at their depth. The set is sticky, so
  // a drifting pearl never pops out; a word just marked known takes a free place and sinks into it.
  const maxDrift = visibleCount >= 10 ? 5 : 3;
  const wall = Date.now();
  const candidate = (slug: string) =>
    !visible.includes(slug) &&
    !!WORD_BY_SLUG.get(slug) &&
    (!topic || WORD_BY_SLUG.get(slug)!.topics.includes(topic)) &&
    !!progress[slug] &&
    !isDue(progress[slug], wall);
  const kept = drifting.current.filter(candidate);
  if (kept.length < maxDrift) {
    const fresh = [
      ...departing.map((d) => d.slug),
      ...Object.values(progress)
        .sort((a, b) => b.lastReviewedAt.localeCompare(a.lastReviewedAt))
        .map((p) => p.slug),
    ].filter((slug, i, all) => all.indexOf(slug) === i && !kept.includes(slug) && candidate(slug));
    kept.push(...fresh.slice(0, maxDrift - kept.length));
  }
  drifting.current = kept;
  sceneCards.visible = [...visible, ...kept];

  for (const d of departing) {
    if (!kept.includes(d.slug)) cards.push({ slug: d.slug, index: -1, departAt: d.at });
  }

  return (
    <group>
      {cards.map((c) => (
        <PearlCard key={c.slug} slug={c.slug} index={c.index} departAt={c.departAt} layout={layout} reducedMotion={reducedMotion} />
      ))}
      {kept.map((slug, i) => (
        <PearlCard key={slug} slug={slug} index={-2} drift={i} layout={layout} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}
