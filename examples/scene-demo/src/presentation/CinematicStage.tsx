import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Vector3 } from 'three';
import type { TimelineCue, TimelinePlayer, TimelineStatus } from './timeline.js';

interface CinematicStageProps {
  readonly playerRef: MutableRefObject<TimelinePlayer | null>;
  readonly pendingCuesRef: MutableRefObject<TimelineCue[]>;
  readonly onCue: (cue: TimelineCue) => void;
  readonly onStatus: (status: TimelineStatus) => void;
}

export function CinematicStage({
  playerRef,
  pendingCuesRef,
  onCue,
  onStatus,
}: CinematicStageProps) {
  const { camera, invalidate } = useThree();
  const initialCamera = useRef<{ position: Vector3; lookAt: Vector3 } | null>(null);
  const cameraTrack = useRef<{
    cue: Extract<TimelineCue, { kind: 'camera' }>;
    startTime: number;
    fromPosition: Vector3;
    fromLookAt: Vector3;
  } | null>(null);
  const previousStatus = useRef<TimelineStatus>('idle');

  useEffect(
    () => () => {
      const player = playerRef.current;
      if (!player) return;
      player.cancel();
      onStatus(player.snapshot().status);
    },
    [onStatus, playerRef],
  );

  useFrame((_, deltaSeconds) => {
    const player = playerRef.current;
    if (!player) return;
    const before = player.snapshot();
    if (initialCamera.current === null) {
      const direction = camera.getWorldDirection(new Vector3());
      initialCamera.current = {
        position: camera.position.clone(),
        lookAt: camera.position.clone().add(direction.multiplyScalar(5)),
      };
    }

    if (
      before.status === 'playing' &&
      previousStatus.current !== 'paused' &&
      previousStatus.current !== 'playing'
    ) {
      cameraTrack.current = null;
      camera.position.copy(initialCamera.current.position);
      camera.lookAt(initialCamera.current.lookAt);
    }

    const cues = [...pendingCuesRef.current.splice(0), ...player.advance(deltaSeconds)];
    for (const cue of cues) {
      if (cue.kind === 'camera') {
        const direction = camera.getWorldDirection(new Vector3());
        cameraTrack.current = {
          cue,
          startTime: cue.atSeconds,
          fromPosition: camera.position.clone(),
          fromLookAt: camera.position.clone().add(direction.multiplyScalar(5)),
        };
      } else {
        onCue(cue);
      }
    }

    const after = player.snapshot();
    if (after.status === 'cancelled' && previousStatus.current !== 'cancelled') {
      cameraTrack.current = null;
      camera.position.copy(initialCamera.current.position);
      camera.lookAt(initialCamera.current.lookAt);
    } else if (cameraTrack.current) {
      const track = cameraTrack.current;
      const progress =
        track.cue.durationSeconds === 0
          ? 1
          : Math.max(
              0,
              Math.min(1, (after.timeSeconds - track.startTime) / track.cue.durationSeconds),
            );
      camera.position.lerpVectors(track.fromPosition, new Vector3(...track.cue.position), progress);
      camera.lookAt(track.fromLookAt.clone().lerp(new Vector3(...track.cue.lookAt), progress));
      if (progress >= 1) cameraTrack.current = null;
      else invalidate();
    }

    if (after.status === 'playing') invalidate();
    if (after.status !== previousStatus.current) onStatus(after.status);
    previousStatus.current = after.status;
  });

  return null;
}
