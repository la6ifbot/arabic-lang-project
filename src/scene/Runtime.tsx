import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sharedUniforms } from './uniforms';

const tmp = new THREE.Vector2();

/**
 * Feeds shared uniforms and quietly lowers resolution if the device is struggling, but never below
 * 1.5× on high-density screens, where lower would make the card text hard to read.
 */
export function Runtime({ maxDpr }: { maxDpr: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const gl = useThree((s) => s.gl);
  const dpr = useRef(maxDpr);
  const floor = Math.min(maxDpr, 1.5);
  const stats = useRef({ frames: 0, time: 0, strikes: 0 });

  useEffect(() => {
    setDpr(dpr.current);
  }, [setDpr]);

  useFrame(({ clock }, dt) => {
    sharedUniforms.uTime.value = clock.elapsedTime;
    gl.getDrawingBufferSize(tmp);
    sharedUniforms.uResolution.value.copy(tmp);

    const st = stats.current;
    if (document.hidden) return;
    st.frames++;
    st.time += dt;
    if (st.time >= 2) {
      const fps = st.frames / st.time;
      st.frames = 0;
      st.time = 0;
      if (fps < 42 && dpr.current > floor) {
        if (++st.strikes >= 2) {
          dpr.current = Math.max(floor, dpr.current - 0.25);
          setDpr(dpr.current);
          st.strikes = 0;
        }
      } else st.strikes = 0;
    }
  });
  return null;
}
