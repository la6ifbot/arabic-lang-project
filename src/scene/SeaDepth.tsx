import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { SEA_DEPTH_KEY } from '../account/storageKeys';
import { SEA_DEEPEN_CAP } from '../progress/queue';
import { useProgress } from '../state/progress';
import { sharedUniforms, STILL } from './uniforms';

/** Last visit's depth, so the sea starts where it was instead of changing as progress loads. */
function storedDepth(): number {
  try {
    const v = Number(localStorage.getItem(SEA_DEPTH_KEY));
    return Number.isFinite(v) ? Math.min(Math.max(v, 0), SEA_DEEPEN_CAP) : 0;
  } catch {
    return 0;
  }
}

/** Eases the whole sea's depth toward the known share, over minutes: never noticeable mid-session. */
export function SeaDepth({ reducedMotion }: { reducedMotion: boolean }) {
  useEffect(() => {
    sharedUniforms.uDeep.value = storedDepth();
  }, []);
  useFrame((_, dt) => {
    const { loaded, deep } = useProgress.getState();
    if (!loaded) return;
    const u = sharedUniforms.uDeep;
    // Reduced motion (and the still test hook): applied at once, with no animation.
    if (reducedMotion || STILL) u.value = deep;
    else u.value += (deep - u.value) * (1 - Math.exp(-Math.min(dt, 0.25) / 40));
  });
  return null;
}
