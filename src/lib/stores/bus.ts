"use client";
import { create } from "zustand";

/** Lets description/comments timestamps talk to the active video player. */
export const useSeekBus = create<{
  seek: ((t: number) => void) | null;
  currentTime: () => number;
  register: (seek: ((t: number) => void) | null, currentTime?: () => number) => void;
}>((set) => ({
  seek: null,
  currentTime: () => 0,
  register: (seek, currentTime) => set({ seek, currentTime: currentTime ?? (() => 0) }),
}));

export function seekTo(t: number) {
  const s = useSeekBus.getState().seek;
  if (s) {
    s(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  }
  return false;
}

let sessionId: string | null = null;
/** Anonymous per-tab id for view de-duplication. */
export function viewSessionId() {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem("tg_sid");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem("tg_sid", sessionId);
    }
  } catch {
    sessionId = crypto.randomUUID();
  }
  return sessionId;
}
