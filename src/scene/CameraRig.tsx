import { useFrame } from '@react-three/fiber';
import { gesture } from '../state/store';
import { CAMERA_Z } from './layout';
import { STILL } from './uniforms';

/** A slow, breathing drift plus a whisper of pointer parallax — the viewer is floating too. */
export function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  useFrame(({ camera, clock }, dt) => {
    const t = STILL ? 0 : clock.elapsedTime;
    const amp = reducedMotion ? 0.2 : 1;
    // Held still sideways while a card is zoomed, so it stays centred and its text fits the screen.
    const tx = gesture.zoom > 1 ? 0 : (Math.sin(t * 0.07) * 0.18 + gesture.px * 0.35) * amp;
    const ty = (Math.sin(t * 0.11 + 1.3) * 0.12 + gesture.py * 0.2) * amp;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 1.2);
    // Re-centres within the pinch itself, so the zoomed card's text never runs off the screen.
    const kx = gesture.zoom > 1 ? 1 - Math.exp(-Math.min(dt, 0.05) * 10) : k;
    camera.position.x += (tx - camera.position.x) * kx;
    camera.position.y += (ty - camera.position.y) * k;
    camera.position.z = CAMERA_Z;
    camera.lookAt(camera.position.x * 0.3, camera.position.y * 0.3, -6);
  });
  return null;
}
