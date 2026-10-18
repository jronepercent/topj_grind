"use client";
import * as React from "react";
import { recordViewAction, saveProgressAction } from "@/app/actions";
import { viewSessionId } from "@/lib/stores/bus";
import { PROGRESS_SAVE_MS, viewThresholdSec } from "@/lib/view-rules";
import type { ContentType } from "@/lib/types";

export type PlaySource = { src: string; type: string; captions: string | null; /** ms epoch when the signed URL stops working */ expiresAt?: number | null };
export type PlayError = "members_only" | "unavailable";
export type PlayFetch = { status: "ok"; source: PlaySource } | { status: PlayError };

/** One call to /api/play. Never throws for HTTP / network problems (only AbortError when a signal is passed). */
export async function fetchPlaySource(id: string, signal?: AbortSignal): Promise<PlayFetch> {
  try {
    const r = await fetch(`/api/play/${id}`, { cache: "no-store", signal });
    if (r.status === 401 || r.status === 403) return { status: "members_only" };
    if (!r.ok) return { status: "unavailable" };
    const j = await r.json();
    const exp = j.expires_at ? Date.parse(j.expires_at) : NaN;
    return { status: "ok", source: { src: j.src, type: j.type, captions: j.captions ?? null, expiresAt: Number.isFinite(exp) ? exp : null } };
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    return { status: "unavailable" };
  }
}

/** Asks /api/play for a short-lived signed URL. The only way media reaches the browser. */
export function usePlaySource(id: string) {
  const [state, setState] = React.useState<{ source: PlaySource | null; error: PlayError | null }>({ source: null, error: null });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    const ctrl = new AbortController();
    setState({ source: null, error: null });
    fetchPlaySource(id, ctrl.signal)
      .then((r) => setState(r.status === "ok" ? { source: r.source, error: null } : { source: null, error: r.status }))
      .catch(() => {
        // aborted: a newer request replaced this one
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

/**
 * Saves the position when the page is going away. sendBeacon is queued by the browser and survives the tab being
 * hidden or closed, which an ordinary fetch / server action does not on a phone with the screen off.
 */
function beaconProgress(id: string, t: number, d: number) {
  const body = JSON.stringify({ id, t, d });
  try {
    if (navigator.sendBeacon?.("/api/progress", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // fall through to fetch
  }
  void fetch("/api/progress", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
}

/**
 * Saves the watch position every 10s while playing (driven by the media element's timeupdate events, not by
 * timers, which phones freeze in the background), and on demand: pause, leave, tab hidden, page closed.
 */
export function useProgressSaver(id: string, enabled = true) {
  const last = React.useRef(0);
  const latest = React.useRef<{ t: number; d: number } | null>(null);

  const flush = React.useCallback(() => {
    const v = latest.current;
    if (!enabled || !v || !v.d) return;
    last.current = Date.now();
    if (document.visibilityState === "hidden") beaconProgress(id, v.t, v.d);
    else void saveProgressAction(id, v.t, v.d);
  }, [id, enabled]);

  const tick = React.useCallback(
    (time: number, duration: number) => {
      latest.current = { t: time, d: duration };
      if (Date.now() - last.current > PROGRESS_SAVE_MS) flush();
    },
    [flush],
  );

  React.useEffect(() => {
    if (!enabled) return;
    const save = () => {
      const v = latest.current;
      if (!v || !v.d) return;
      last.current = Date.now();
      beaconProgress(id, v.t, v.d);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
    };
  }, [id, enabled]);

  React.useEffect(
    () => () => {
      flush();
      // A different episode may take over this hook: never let it inherit the old position.
      latest.current = null;
      last.current = 0;
    },
    [flush],
  );
  return { tick, flush };
}
