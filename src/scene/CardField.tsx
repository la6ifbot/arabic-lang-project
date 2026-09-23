import { useEffect, useMemo, useReducer, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EXIT_MS, useDurar } from '../state/store';
import { Layout } from './layout';
import { PearlCard } from './PearlCard';

export function CardField({ visibleCount, reducedMotion }: { visibleCount: number; reducedMotion: boolean }) {
  const order = useDurar((s) => s.order);
  const departures = useDurar((s) => s.departures);
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
  for (const d of departures) {
    if (now - d.at < EXIT_MS && !visible.includes(d.slug)) cards.push({ slug: d.slug, index: -1, departAt: d.at });
  }

  return (
    <group>
      {cards.map((c) => (
        <PearlCard key={c.slug} slug={c.slug} index={c.index} departAt={c.departAt} layout={layout} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}
