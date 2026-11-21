import { useFrame } from '@react-three/fiber';
import { sceneProbe } from './probe.js';

export function SceneFrameProbe() {
  useFrame(() => {
    const probe = sceneProbe();
    if (probe) probe.frameCount += 1;
  });
  return null;
}
