"use client";
import * as React from "react";
import { recordViewAction, saveProgressAction } from "@/app/actions";
import { viewSessionId } from "@/lib/stores/bus";
import { PROGRESS_SAVE_MS, viewThresholdSec } from "@/lib/view-rules";
import type { ContentType } from "@/lib/types";

export type PlaySource = { src: string; type: string; captions: string | null };
export type PlayError = "members_only" | "unavailable";

/** Asks /api/play for a short-lived signed URL. The only way media reaches the browser. */
export function usePlaySource(id: string) {
  const [state, setState] = React.useState<{ source: PlaySource | null; error: PlayError | null }>({ source: null, error: null });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    const ctrl = new AbortController();
    setState({ source: null, error: null });
    fetch(`/api/play/${id}`, { cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) return setState({ source: null, error: "members_only" });
        if (!r.ok) return setState({ source: null, error: "unavailable" });
        const j = await r.json();
        setState({ source: { src: j.src, type: j.type, captions: j.captions ?? null }, error: null });
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setState({ source: null, error: "unavailable" });
      });
    return () => ctrl.abort();
  }, [id, attempt]);

  return { ...state, retry: () => setAttempt((a) => a + 1) };
}

/**
 * Counts real watched seconds (seeking doesn't count) and records one view
 * when the shared threshold is crossed.
 */
export function useViewTracker(id: string, type: ContentType) {
  const w = React.useRef({ sec: 0, last: 0, counted: false });
  React.useEffect(() => {
    w.current = { sec: 0, last: 0, counted: false };
  }, [id]);
  return React.useCallback(
    (time: number, paused: boolean, duration: number) => {
      const s = w.current;
      const delta = time - s.last;
      if (!paused && delta > 0 && delta < 2) s.sec += delta;
      s.last = time;
      if (!s.counted && duration > 0 && s.sec >= viewThresholdSec(type, duration)) {
        s.counted = true;
        void recordViewAction(id, viewSessionId(), s.sec);
      }
    },
    [id, type],
  );
}

/** Saves the watch position every 10s while playing, and on demand (pause, leave). */
export function useProgressSaver(id: string, enabled = true) {
  const last = React.useRef(0);
  const latest = React.useRef<{ t: number; d: number } | null>(null);

  const flush = React.useCallback(() => {
    const v = latest.current;
    if (!enabled || !v || !v.d) return;
    last.current = Date.now();
    void saveProgressAction(id, v.t, v.d);
  }, [id, enabled]);

  const tick = React.useCallback(
    (time: number, duration: number) => {
      latest.current = { t: time, d: duration };
      if (Date.now() - last.current > PROGRESS_SAVE_MS) flush();
    },
    [flush],
  );

  React.useEffect(() => () => flush(), [flush]);
  return { tick, flush };
}
