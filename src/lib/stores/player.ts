"use client";
import { create } from "zustand";
import type { Chapter } from "@/lib/types";

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
  expanded: boolean;
  /** bumps every time play() is called so the player can re-seek / restart */
  nonce: number;
  sleep: Sleep;
  /** live mirror of media state for UI elsewhere (e.g. podcast list buttons) */
  paused: boolean;
  currentTime: number;
  rate: number;
  play: (item: PlayerItem, queue?: PlayerItem[]) => void;
  setQueue: (q: PlayerItem[]) => void;
  next: () => void;
  close: () => void;
  setExpanded: (v: boolean) => void;
  setSleep: (s: Sleep) => void;
  sync: (s: { paused?: boolean; currentTime?: number; rate?: number }) => void;
  /** set by GlobalPlayer so other components can toggle playback */
  controls: { toggle: () => void; seek: (t: number) => void; setRate: (r: number) => void } | null;
  setControls: (c: PlayerState["controls"]) => void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  item: null,
  queue: [],
  expanded: false,
  nonce: 0,
  sleep: { mode: "off" },
  paused: true,
  currentTime: 0,
  rate: 1,
  controls: null,
  play: (item, queue) =>
    set((s) => ({ item, queue: queue ?? s.queue.filter((q) => q.id !== item.id), nonce: s.nonce + 1, paused: false })),
  setQueue: (queue) => set({ queue }),
  next: () => {
    const [n, ...rest] = get().queue;
    if (n) set((s) => ({ item: n, queue: rest, nonce: s.nonce + 1 }));
    else set({ item: null, expanded: false });
  },
  close: () => set({ item: null, expanded: false, queue: [], sleep: { mode: "off" } }),
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
