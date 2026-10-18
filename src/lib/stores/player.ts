"use client";
import { create } from "zustand";
import type { Chapter } from "@/lib/types";
import { unlockAudio } from "./audio-element";

export interface PlayerItem {
  id: string;
  type: "podcast" | "video";
  title: string;
  thumb: string | null;
  duration: number;
  chapters?: Chapter[];
  startAt?: number;
}

type Sleep = { mode: "off" } | { mode: "time"; at: number; minutes: number } | { mode: "end" };

interface PlayerState {
  item: PlayerItem | null;
  queue: PlayerItem[];
  /** episodes already played (most recent last), so "previous" on the lock screen can go back */
  history: PlayerItem[];
  expanded: boolean;
  /** bumps every time play() is called so the player can re-seek / restart */
  nonce: number;
  sleep: Sleep;
  /** live mirror of media state for UI elsewhere (e.g. podcast list buttons) */
  paused: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  play: (item: PlayerItem, queue?: PlayerItem[]) => void;
  setQueue: (q: PlayerItem[]) => void;
  next: () => void;
  previous: () => void;
  close: () => void;
  setExpanded: (v: boolean) => void;
  setSleep: (s: Sleep) => void;
  sync: (s: { paused?: boolean; currentTime?: number; duration?: number; rate?: number }) => void;
  /** set by GlobalPlayer so other components can toggle playback */
  controls: { toggle: () => void; seek: (t: number) => void; setRate: (r: number) => void } | null;
  setControls: (c: PlayerState["controls"]) => void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  item: null,
  queue: [],
  history: [],
  expanded: false,
  nonce: 0,
  sleep: { mode: "off" },
  paused: true,
  currentTime: 0,
  duration: 0,
  rate: 1,
  controls: null,
  play: (item, queue) => {
    // Runs inside the listener's tap: unlock the shared <audio> element before any await happens.
    if (item.type === "podcast") unlockAudio();
    set((s) => ({
      item,
      queue: queue ?? s.queue.filter((q) => q.id !== item.id),
      history: s.item && s.item.id !== item.id && s.item.type === "podcast" ? [...s.history, s.item].slice(-20) : s.history,
      nonce: s.nonce + 1,
      paused: false,
      currentTime: item.startAt ?? 0,
      duration: item.duration,
    }));
  },
  setQueue: (queue) => set({ queue }),
  next: () => {
    const [n, ...rest] = get().queue;
    if (n)
      set((s) => ({
        item: n,
        queue: rest,
        history: s.item?.type === "podcast" ? [...s.history, s.item].slice(-20) : s.history,
        nonce: s.nonce + 1,
        paused: false,
        currentTime: n.startAt ?? 0,
        duration: n.duration,
      }));
    else set({ item: null, expanded: false });
  },
  previous: () => {
    const prev = get().history.at(-1);
    if (!prev) return;
    set((s) => ({
      item: prev,
      queue: s.item ? [s.item, ...s.queue] : s.queue,
      history: s.history.slice(0, -1),
      nonce: s.nonce + 1,
      paused: false,
      currentTime: 0,
      duration: prev.duration,
    }));
  },
  close: () => set({ item: null, expanded: false, queue: [], history: [], sleep: { mode: "off" } }),
  setExpanded: (expanded) => set({ expanded }),
  setSleep: (sleep) => set({ sleep }),
  sync: (s) => set(s),
  setControls: (controls) => set({ controls }),
}));

interface UIState {
  sidebar: "auto" | "full" | "mini";
  drawer: boolean;
  theater: boolean;
  setSidebar: (v: UIState["sidebar"]) => void;
  setDrawer: (v: boolean) => void;
  setTheater: (v: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  sidebar: "auto",
  drawer: false,
  theater: false,
  setSidebar: (sidebar) => {
    try {
      localStorage.setItem("tg_sidebar", sidebar);
    } catch {}
    set({ sidebar });
  },
  setDrawer: (drawer) => set({ drawer }),
  setTheater: (theater) => {
    try {
      localStorage.setItem("tg_theater", theater ? "1" : "0");
    } catch {}
    set({ theater });
  },
}));
