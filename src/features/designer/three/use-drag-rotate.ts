"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { MathUtils, type Group } from "three";

const YAW_PER_PX = 0.011;
const PITCH_PER_PX = 0.006;
export const MAX_PITCH = 0.45;
/** Hur snabbt trögheten efter ett släpp dör ut (1/s). */
const INERTIA_DECAY = 3.2;
const MAX_FLING_RAD_PER_S = 9;
/** Hur snabbt lutningen går tillbaka till rakt fram efter ett släpp. */
const PITCH_RETURN_DAMPING = 2.5;
/** Paus efter att kunden släppt innan autosnurren tar över igen. */
export const RESUME_AFTER_DRAG_MS = 1800;

export interface DragState {
  dragging: boolean;
  /** Radianer per sekund kvar efter släpp. */
  velocityY: number;
  pitch: number;
  releasedAt: number;
}

/**
 * Dra för att vrida skylten — en enda rotation som autosnurr, fokus och
 * inspelning delar på, så att inget lager slåss om vinkeln.
 */
export function useDragRotate(target: RefObject<Group | null>, locked: () => boolean): RefObject<DragState> {
  const element = useThree((state) => state.gl.domElement);
  const state = useRef<DragState>({ dragging: false, velocityY: 0, pitch: 0, releasedAt: -Infinity });

  useEffect(() => {
    let last: { x: number; y: number; t: number } | null = null;
    element.style.cursor = "grab";

    const down = (event: PointerEvent) => {
      if (locked() || !event.isPrimary) return;
      element.setPointerCapture(event.pointerId);
      element.style.cursor = "grabbing";
      last = { x: event.clientX, y: event.clientY, t: event.timeStamp };
      state.current.dragging = true;
      state.current.velocityY = 0;
    };

    const move = (event: PointerEvent) => {
      const group = target.current;
      if (!last || !group || !state.current.dragging) return;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      const dt = Math.max(1, event.timeStamp - last.t) / 1000;
      group.rotation.y += dx * YAW_PER_PX;
      state.current.pitch = MathUtils.clamp(state.current.pitch + dy * PITCH_PER_PX, -MAX_PITCH, MAX_PITCH);
      // Utjämnad hastighet så att ett ryckigt sista event inte ger ett jättekast.
      const instant = MathUtils.clamp((dx * YAW_PER_PX) / dt, -MAX_FLING_RAD_PER_S, MAX_FLING_RAD_PER_S);
      state.current.velocityY = state.current.velocityY * 0.6 + instant * 0.4;
      last = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    };

    const up = (event: PointerEvent) => {
      if (!state.current.dragging) return;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      // Fingret stod still innan släppet — ingen tröghet.
      if (last && event.timeStamp - last.t > 80) state.current.velocityY = 0;
      element.style.cursor = "grab";
      last = null;
      state.current.dragging = false;
      state.current.releasedAt = performance.now();
    };

    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.style.cursor = "";
    };
  }, [element, target, locked]);

  return state;
}

/** Tröghet och lutning efter släpp, ett steg om `delta` sekunder. */
export function settleAfterDrag(group: Group, drag: DragState, delta: number): void {
  if (!drag.dragging) {
    group.rotation.y += drag.velocityY * delta;
    drag.velocityY *= Math.exp(-INERTIA_DECAY * delta);
    if (Math.abs(drag.velocityY) < 0.01) drag.velocityY = 0;
    drag.pitch = MathUtils.damp(drag.pitch, 0, PITCH_RETURN_DAMPING, delta);
  }
  group.rotation.x = drag.pitch;
}
