import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Backdrop } from './Backdrop';
import { Bubbles } from './Bubbles';
import { CameraRig } from './CameraRig';
import { CardField } from './CardField';
import { GodRays } from './GodRays';
import { CAMERA_FOV, CAMERA_Z } from './layout';
import { Particles } from './Particles';
import { Runtime } from './Runtime';
import { useSwipeInput } from './useSwipeInput';

export interface Quality {
  maxDpr: number;
  particles: number;
  visibleCards: number;
}

export function Experience({
  quality,
  reducedMotion,
  onFirstSwipe,
  onContextLost,
  onReady,
}: {
  quality: Quality;
  reducedMotion: boolean;
  onFirstSwipe: () => void;
  onContextLost: () => void;
  onReady?: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useSwipeInput(wrap, onFirstSwipe);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return (
    <div ref={wrap} className="scene" aria-hidden="true" data-testid="scene">
      <Canvas
        flat
        linear
        dpr={1}
        camera={{ position: [0, 0, CAMERA_Z], fov: CAMERA_FOV, near: 0.1, far: 80 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        onCreated={({ gl }) => {
          gl.setClearColor('#020b14');
          requestAnimationFrame(() => onReady?.());
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            // r3f deliberately drops the context when the scene unmounts; only react to real losses.
            if (mounted.current) onContextLost();
          });
        }}
      >
        <Runtime maxDpr={quality.maxDpr} />
        <CameraRig reducedMotion={reducedMotion} />
        <Backdrop />
        <CardField visibleCount={quality.visibleCards} reducedMotion={reducedMotion} />
        <GodRays reducedMotion={reducedMotion} />
        <Particles count={quality.particles} reducedMotion={reducedMotion} />
        <Bubbles />
      </Canvas>
    </div>
  );
}
