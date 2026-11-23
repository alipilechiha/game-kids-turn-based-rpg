import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MapId } from '../domain/game/types.ts';
import type { WorldSource } from '../domain/world/source.ts';
import { prefersReducedMotion } from '../services/device/capabilities.ts';
import { getMap } from './maps.ts';
import { getAnchor } from './navigation/graph.ts';
import {
  CAMERA_ORBIT_SENSITIVITY,
  cameraOffsetFromAngles,
  cameraPaddingForMap,
  clampCameraPitch,
  clampCameraTarget,
  clampCameraYaw,
  clampUserZoom,
  DEFAULT_CAMERA_PITCH,
  DEFAULT_CAMERA_YAW,
  resolveCameraSource,
  shouldApplyPan,
  shouldCancelGestureOnOverrideTransition,
  zoomForMap,
  type CameraFocusOverride,
  type CameraFocusOverrideRequest,
  type CameraTarget,
} from './camera.ts';

/**
 * Where the camera should look: the avatar's live position, published by the
 * mounted map scene (Hub/CaveWorld) from the single `useWalker` source of
 * truth. A mutable store — consumers read it per-frame, no re-render needed.
 */
export interface CameraFocus {
  x: number;
  z: number;
}

interface MutableTarget {
  x: number;
  z: number;
}

/**
 * The camera's focus: the avatar's live position, written by the mounted
 * map scene (Hub/CaveWorld) from its useWalker state. A module-level store —
 * CameraRig reads it per-frame; writing it never re-renders the tree and
 * needs no React plumbing.
 */
export const cameraFocus: CameraFocus = { x: 0, z: 0 };

let invalidateCamera: (() => void) | null = null;

/**
 * Publishes the avatar's live position for the camera and wakes the demand
 * render loop. Under frameloop="demand" no frame runs while the camera is
 * settled — writing the store alone would never be observed, so a publish
 * also invalidates and lets the rig ease toward the new target.
 */
export function publishCameraFocus(x: number, z: number) {
  cameraFocus.x = x;
  cameraFocus.z = z;
  invalidateCamera?.();
}

/**
 * Temporary presentation override of the camera focus (e.g. a stage that
 * wants the camera on someone else for a moment). Token-owned: a caller
 * may only update/clear the override it created — a later `set` supersedes
 * and makes earlier tokens stale, so a late cleanup can never cancel a
 * newer owner's request. Module-level mutable state like `cameraFocus`;
 * the frame loop reads it, it never re-renders, and it must never touch
 * game logic.
 */
let cameraFocusOverride: CameraFocusOverride | null = null;
let nextOverrideToken = 1;

/** Exposes the active override on the DEV/probe window channel for e2e. */
function publishOverrideProbe() {
  if (typeof window === 'undefined') return;
  const probe = window as unknown as Record<string, unknown>;
  if (import.meta.env.DEV || probe['__WORLD_PROBE']) {
    probe['__worldCameraOverride'] = cameraFocusOverride;
  }
}

export function setCameraFocusOverride(request: CameraFocusOverrideRequest): number {
  const token = nextOverrideToken++;
  cameraFocusOverride = { ...request, token };
  publishOverrideProbe();
  invalidateCamera?.();
  return token;
}

export function clearCameraFocusOverride(token: number): void {
  if (cameraFocusOverride?.token !== token) return;
  cameraFocusOverride = null;
  publishOverrideProbe();
  invalidateCamera?.();
}

export function updateCameraFocusOverride(
  token: number,
  partial: Partial<CameraFocusOverrideRequest>,
): void {
  if (cameraFocusOverride?.token !== token) return;
  cameraFocusOverride = { ...cameraFocusOverride, ...partial, token };
  publishOverrideProbe();
  invalidateCamera?.();
}

export function getCameraFocusOverride(): CameraFocusOverride | null {
  return cameraFocusOverride;
}

/**
 * Follow-camera controller: an orthographic camera at
 * `target + orbitOffset` looking at the target, where the target is the
 * player's position clamped inside the current map's padded bounds.
 *
 * Angle control (presentation only — never game logic):
 * - Mouse: right-button or middle-button drag, or Alt+left drag, orbits yaw/pitch.
 * - Touch: two-finger twist orbits yaw; shared vertical drag tilts pitch.
 *   Pinch scale still zooms. One-finger drag remains ground pan / tap.
 *
 * Lifecycle is map-local: `WorldCanvas` mounts one rig per map (`key` =
 * mapId), and on mount the rig snaps to that map's spawn anchor — a map
 * transition can never inherit a stale target from the previous map.
 *
 * `frameloop="demand"`: while the target drifts from its desired clamped
 * point the rig calls `invalidate()`; once settled it stops asking for
 * frames entirely. Reduced motion snaps instead of easing.
 */
/** World-space look offset the child created by dragging the map around. */
interface PanOffset {
  x: number;
  z: number;
}

interface DragGesture {
  id: number;
  startX: number;
  startY: number;
  panX: number;
  panZ: number;
  downX?: number;
  downZ?: number;
  panning: boolean;
  /** Right/middle/Alt-left mouse orbit — never walks or pans. */
  orbiting: boolean;
  yaw0: number;
  pitch0: number;
}

interface OrbitAngles {
  yaw: number;
  pitch: number;
}

export function CameraRig({
  world,
  mapId,
  zoomFactor = 1,
  onZoomFactor,
}: {
  readonly world: WorldSource;
  readonly mapId: MapId;
  /** Child-facing multiplier on the map zoom (PR T) — a projection-only
      input: it rescales the ortho camera and the bounds clamp, nothing
      else in the world. Session state, owned by the caller. */
  readonly zoomFactor?: number;
  /** Wheel/pinch asks the caller for a new factor (already clamped). */
  readonly onZoomFactor?: ((factor: number) => void) | undefined;
}) {
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const reduced = prefersReducedMotion();
  const map = getMap(world, mapId);
  const zoom = zoomForMap(world, mapId) * clampUserZoom(zoomFactor);
  const padding = cameraPaddingForMap(world, mapId);

  // Single reusable vectors — no per-frame allocation while settling.
  const target = useRef<MutableTarget>({ x: 0, z: 0 });
  const look = useRef(new THREE.Vector3());
  const settled = useRef(false);
  // Drag-to-look-around: the child can pull the map under their finger to
  // peek farther. The offset decays to zero the moment they walk again.
  const pan = useRef<PanOffset>({ x: 0, z: 0 });
  // Constrained orbit angles — presentation only; reset on map remount.
  const angles = useRef<OrbitAngles>({
    yaw: DEFAULT_CAMERA_YAW,
    pitch: DEFAULT_CAMERA_PITCH,
  });
  const anglesGoal = useRef<OrbitAngles>({
    yaw: DEFAULT_CAMERA_YAW,
    pitch: DEFAULT_CAMERA_PITCH,
  });
  const prevFocus = useRef<MutableTarget>({ x: 0, z: 0 });
  // Override activation AND deactivation are both gesture boundaries: a
  // drag held across either edge cannot resume with a stale baseline.
  const prevOverrideActive = useRef(false);
  const gesture = useRef<DragGesture | null>(null);
  // The eased ortho zoom: eases toward `zoom` (map zoom × child factor)
  // exactly like the target eases toward its clamp — bounded frames only.
  const zoomCurrent = useRef(zoom);
  // Latest zoomFactor for the gesture listeners (their closure is stale
  // across renders; a ref isn't).
  const zoomFactorRef = useRef(zoomFactor);
  const onZoomFactorRef = useRef(onZoomFactor);
  useEffect(() => {
    zoomFactorRef.current = zoomFactor;
    onZoomFactorRef.current = onZoomFactor;
  }, [zoomFactor, onZoomFactor]);

  const publishOrbitProbe = useCallback((lookX?: number, lookZ?: number) => {
    if (typeof window === 'undefined') return;
    const probe = window as unknown as Record<string, unknown>;
    if (import.meta.env.DEV || probe['__WORLD_PROBE']) {
      probe['__worldCameraOrbit'] = {
        yaw: anglesGoal.current.yaw,
        pitch: anglesGoal.current.pitch,
      };
      if (lookX !== undefined && lookZ !== undefined) {
        probe['__worldCameraLook'] = { x: lookX, z: lookZ };
      }
    }
  }, []);

  const applyCameraPose = useCallback(
    (lookX: number, lookZ: number, yaw: number, pitch: number) => {
      const offset = cameraOffsetFromAngles(yaw, pitch);
      camera.position.set(lookX + offset.x, offset.y, lookZ + offset.z);
      look.current.set(lookX, 0, lookZ);
      camera.lookAt(look.current);
      publishOrbitProbe(lookX, lookZ);
    },
    [camera, publishOrbitProbe],
  );

  const desired = useCallback(
    (x: number, z: number, goalZoom: number = zoom, pad: number = padding): CameraTarget =>
      clampCameraTarget({ x, z }, map.bounds, size.width, size.height, goalZoom, pad),
    [map.bounds, size.width, size.height, zoom, padding],
  );

  // Mount = map entry: the first rendered frame snaps target+camera to the
  // map's spawn anchor and applies this map's zoom — never inheriting a
  // stale target from the previous map. Camera mutations live in the frame
  // loop (the only place that may write to three objects).
  const booted = useRef(false);

  useEffect(() => {
    // Own the camera wake channel while mounted, and kick the demand loop so
    // the boot frame runs even before the scene publishes its first focus.
    invalidateCamera = invalidate;
    invalidate();
    return () => {
      invalidateCamera = null;
    };
  }, [invalidate]);

  // A zoom-factor change (button, wheel, pinch) is a pure prop update under
  // frameloop="demand" — wake the loop so the rig eases to the new zoom and
  // re-clamps the target for the changed footprint.
  useEffect(() => {
    invalidate();
  }, [zoom, invalidate]);

  // Drag-to-pan / orbit / pinch: one finger or left mouse pans; right/middle
  // or Alt+left orbits; two fingers pinch-zoom and twist-orbit. Taps stay
  // taps — under ~8px of movement nothing pans.
  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const groundAt = (clientX: number, clientY: number): { x: number; z: number } | null => {
      const rect = el.getBoundingClientRect();
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(ground, hit) !== null ? { x: hit.x, z: hit.z } : null;
    };
    const pointers = new Map<number, { x: number; y: number }>();
    const pinch = {
      active: false,
      d0: 0,
      f0: 1,
      angle0: 0,
      yaw0: DEFAULT_CAMERA_YAW,
      pitch0: DEFAULT_CAMERA_PITCH,
      midY0: 0,
    };
    const pinchDistance = (): number => {
      const [a, b] = [...pointers.values()];
      return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
    };
    const pinchAngle = (): number => {
      const [a, b] = [...pointers.values()];
      return a === undefined || b === undefined ? 0 : Math.atan2(b.y - a.y, b.x - a.x);
    };
    const pinchMidY = (): number => {
      const [a, b] = [...pointers.values()];
      return a === undefined || b === undefined ? 0 : (a.y + b.y) / 2;
    };
    const isOrbitMouse = (event: PointerEvent): boolean =>
      event.pointerType === 'mouse' &&
      (event.button === 1 || event.button === 2 || (event.button === 0 && event.altKey));
    const onContextMenu = (event: Event) => {
      event.preventDefault();
    };
    const onDown = (event: PointerEvent) => {
      if (
        event.pointerType === 'mouse' &&
        event.button !== 0 &&
        event.button !== 1 &&
        event.button !== 2
      ) {
        return;
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        gesture.current = null;
        pinch.active = true;
        pinch.d0 = pinchDistance();
        pinch.f0 = zoomFactorRef.current;
        pinch.angle0 = pinchAngle();
        pinch.yaw0 = anglesGoal.current.yaw;
        pinch.pitch0 = anglesGoal.current.pitch;
        pinch.midY0 = pinchMidY();
        return;
      }
      const orbiting = isOrbitMouse(event);
      if (orbiting) event.preventDefault();
      const probe = window as unknown as Record<string, unknown>;
      if (import.meta.env.DEV || probe['__WORLD_PROBE']) probe['__worldPanDown'] = true;
      const at = !orbiting ? groundAt(event.clientX, event.clientY) : null;
      const pannable = !orbiting && shouldApplyPan(cameraFocusOverride);
      gesture.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: pan.current.x,
        panZ: pan.current.z,
        ...(pannable && at ? { downX: at.x, downZ: at.z } : {}),
        panning: false,
        orbiting,
        yaw0: anglesGoal.current.yaw,
        pitch0: anglesGoal.current.pitch,
      };
    };
    const onMove = (event: PointerEvent) => {
      if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (pinch.active) {
        const d = pinchDistance();
        if (onZoomFactorRef.current !== undefined && pinch.d0 > 0 && d > 0) {
          onZoomFactorRef.current(clampUserZoom((d / pinch.d0) * pinch.f0));
        }
        // Two-finger twist = yaw; shared vertical drag = pitch.
        let deltaAngle = pinchAngle() - pinch.angle0;
        if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
        anglesGoal.current.yaw = clampCameraYaw(pinch.yaw0 - deltaAngle);
        anglesGoal.current.pitch = clampCameraPitch(
          pinch.pitch0 + (pinchMidY() - pinch.midY0) * CAMERA_ORBIT_SENSITIVITY,
        );
        // Snap while the gesture is live — easing after release only.
        angles.current.yaw = anglesGoal.current.yaw;
        angles.current.pitch = anglesGoal.current.pitch;
        const lookX = target.current.x;
        const lookZ = target.current.z;
        applyCameraPose(lookX, lookZ, angles.current.yaw, angles.current.pitch);
        publishOrbitProbe(lookX, lookZ);
        settled.current = false;
        invalidate();
        return;
      }
      const g = gesture.current;
      if (g === null || event.pointerId !== g.id) return;
      if (g.orbiting) {
        if (!g.panning && Math.hypot(event.clientX - g.startX, event.clientY - g.startY) < 4) {
          return;
        }
        g.panning = true;
        anglesGoal.current.yaw = clampCameraYaw(
          g.yaw0 - (event.clientX - g.startX) * CAMERA_ORBIT_SENSITIVITY,
        );
        anglesGoal.current.pitch = clampCameraPitch(
          g.pitch0 + (event.clientY - g.startY) * CAMERA_ORBIT_SENSITIVITY,
        );
        angles.current.yaw = anglesGoal.current.yaw;
        angles.current.pitch = anglesGoal.current.pitch;
        const lookX = target.current.x;
        const lookZ = target.current.z;
        applyCameraPose(lookX, lookZ, angles.current.yaw, angles.current.pitch);
        publishOrbitProbe(lookX, lookZ);
        settled.current = false;
        invalidate();
        return;
      }
      if (g.downX === undefined || g.downZ === undefined) return;
      if (!g.panning && Math.hypot(event.clientX - g.startX, event.clientY - g.startY) < 8) {
        return;
      }
      g.panning = true;
      if (!shouldApplyPan(cameraFocusOverride)) return;
      const at = groundAt(event.clientX, event.clientY);
      if (!at) return;
      pan.current.x = g.panX + (g.downX - at.x);
      pan.current.z = g.panZ + (g.downZ - at.z);
      const probe = window as unknown as Record<string, unknown>;
      if (import.meta.env.DEV || probe['__WORLD_PROBE']) {
        probe['__worldPan'] = { x: pan.current.x, z: pan.current.z, live: true };
      }
      const want = desired(cameraFocus.x + pan.current.x, cameraFocus.z + pan.current.z);
      target.current.x = want.x;
      target.current.z = want.z;
      applyCameraPose(want.x, want.z, angles.current.yaw, angles.current.pitch);
      settled.current = false;
      invalidate();
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch.active = false;
      if (gesture.current?.id === event.pointerId) gesture.current = null;
    };
    const onWheel = (event: WheelEvent) => {
      const apply = onZoomFactorRef.current;
      if (apply === undefined) return;
      event.preventDefault();
      apply(clampUserZoom(zoomFactorRef.current * Math.exp(-event.deltaY * 0.0012)));
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl, camera, invalidate, desired, applyCameraPose, publishOrbitProbe]);

  useFrame((frameState, delta) => {
    const frameCamera = frameState.camera;
    if (!booted.current) {
      booted.current = true;
      // The mount target is derived from this map's spawn anchor: on a fresh
      // load cameraFocus already holds the spawn (the walker spawns there),
      // and on a map transition it holds the arrival anchor — either way the
      // rig never inherits a stale target from the previous map. Orbit resets
      // to the default isometric angles on every map entry.
      const spawn = getAnchor(world, map.spawnAnchorId);
      const start = desired(
        cameraFocus.x === 0 && cameraFocus.z === 0 ? spawn.x : cameraFocus.x,
        cameraFocus.x === 0 && cameraFocus.z === 0 ? spawn.z : cameraFocus.z,
      );
      target.current = start;
      angles.current = { yaw: DEFAULT_CAMERA_YAW, pitch: DEFAULT_CAMERA_PITCH };
      anglesGoal.current = { yaw: DEFAULT_CAMERA_YAW, pitch: DEFAULT_CAMERA_PITCH };
      publishOrbitProbe();
      zoomCurrent.current = zoom;
      frameCamera.zoom = zoom;
      applyCameraPose(start.x, start.z, angles.current.yaw, angles.current.pitch);
      frameCamera.updateProjectionMatrix();
      settled.current = false;
    }
    // The single camera-source decision: live base focus, or the active
    // override's point/zoom/padding. `cameraFocus` keeps receiving Hub's
    // publishes untouched, so clearing restores the CURRENT base focus.
    const src = resolveCameraSource(cameraFocus, cameraFocusOverride, zoom, padding);
    // Override activation and deactivation both invalidate any in-flight
    // gesture: its captured ground point and pan baseline must not be
    // reused on the other side of the boundary. Because onMove early-
    // returns for a null gesture or a missing downX/downZ, a physically
    // held pointer spanning the boundary stays inert — only a fresh
    // pointerdown (new onDown) may pan. Stale pan accumulation is dropped
    // too so the camera cannot jump across the edge.
    const overrideActive = cameraFocusOverride !== null;
    if (shouldCancelGestureOnOverrideTransition(prevOverrideActive.current, overrideActive)) {
      gesture.current = null;
      pan.current.x = 0;
      pan.current.z = 0;
      settled.current = false;
      invalidate();
    }
    prevOverrideActive.current = overrideActive;
    // A moving player owns the camera again: any focus change eases the
    // child's pan offset back to zero so the view returns to them. Under
    // an override the decay stays inert — the override owns the camera.
    const focusMoved =
      prevFocus.current.x !== cameraFocus.x || prevFocus.current.z !== cameraFocus.z;
    prevFocus.current.x = cameraFocus.x;
    prevFocus.current.z = cameraFocus.z;
    if (!overrideActive && focusMoved && (pan.current.x !== 0 || pan.current.z !== 0)) {
      const k = reduced ? 1 : Math.min(1, delta * 5.2);
      pan.current.x *= 1 - k;
      pan.current.z *= 1 - k;
      if (Math.abs(pan.current.x) < 0.02) pan.current.x = 0;
      if (Math.abs(pan.current.z) < 0.02) pan.current.z = 0;
      settled.current = false;
      invalidate();
    }
    // Zoom eases like the target: a factor change (button, wheel, pinch)
    // or an override keeps asking for frames only until the projection
    // settles.
    const zd = src.zoom - zoomCurrent.current;
    if (Math.abs(zd) > 0.0005) {
      const k = reduced ? 1 : Math.min(1, delta * 5.2);
      zoomCurrent.current += zd * k;
      if (Math.abs(src.zoom - zoomCurrent.current) <= 0.0005) zoomCurrent.current = src.zoom;
      frameCamera.zoom = zoomCurrent.current;
      frameCamera.updateProjectionMatrix();
      settled.current = false;
      invalidate();
    }
    // Orbit angles ease toward the gesture goal; reduced motion snaps.
    const yawDelta = anglesGoal.current.yaw - angles.current.yaw;
    const pitchDelta = anglesGoal.current.pitch - angles.current.pitch;
    if (Math.abs(yawDelta) > 0.0005 || Math.abs(pitchDelta) > 0.0005) {
      const k = reduced ? 1 : Math.min(1, delta * 8);
      angles.current.yaw += yawDelta * k;
      angles.current.pitch += pitchDelta * k;
      if (Math.abs(anglesGoal.current.yaw - angles.current.yaw) <= 0.0005) {
        angles.current.yaw = anglesGoal.current.yaw;
      }
      if (Math.abs(anglesGoal.current.pitch - angles.current.pitch) <= 0.0005) {
        angles.current.pitch = anglesGoal.current.pitch;
      }
      settled.current = false;
      invalidate();
    }
    const want = desired(src.x + pan.current.x, src.z + pan.current.z, src.zoom, src.padding);
    const t = target.current;
    const dx = want.x - t.x;
    const dz = want.z - t.z;
    const anglesSettled =
      Math.abs(anglesGoal.current.yaw - angles.current.yaw) <= 0.0005 &&
      Math.abs(anglesGoal.current.pitch - angles.current.pitch) <= 0.0005;
    if (Math.abs(dx) < 0.002 && Math.abs(dz) < 0.002 && anglesSettled) {
      if (settled.current) return;
      t.x = want.x;
      t.z = want.z;
      settled.current = true;
    } else {
      invalidate();
      const k = reduced ? 1 : Math.min(1, delta * 5.2);
      t.x += dx * k;
      t.z += dz * k;
      settled.current = false;
    }
    applyCameraPose(t.x, t.z, angles.current.yaw, angles.current.pitch);
  });

  return null;
}
