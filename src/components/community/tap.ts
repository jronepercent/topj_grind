import type * as React from "react";

/** A touch counts as a tap only if the finger barely moved and lifted quickly (not a scroll flick or swipe). */
export function isTap(start: { x: number; y: number; t: number } | null, e: React.TouchEvent) {
  const t = e.changedTouches[0];
  if (!start || !t) return false;
  return Math.hypot(t.clientX - start.x, t.clientY - start.y) < 10 && Date.now() - start.t < 250;
}

export function touchStart(e: React.TouchEvent) {
  const t = e.touches[0];
  return t ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
}
