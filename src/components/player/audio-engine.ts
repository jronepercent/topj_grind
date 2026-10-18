"use client";
import * as React from "react";
import { usePlayer, type PlayerItem } from "@/lib/stores/player";
import { getAudio } from "@/lib/stores/audio-element";
import { fetchPlaySource, useProgressSaver, useViewTracker, type PlayFetch, type PlaySource } from "./playback-hooks";

export type AudioStatus = "loading" | "ready" | "unavailable" | "members_only";

const SEEK_BACK = 15;
const SEEK_FWD = 30;
/** Fetch the next episode's signed URL this long before the current one ends. */
const PREFETCH_WITHIN_SEC = 60;
/** Fresh-link retries after a mid-episode error (they reset once playback has moved on for a while). */
const MAX_RECOVERIES = 2;
/** Buffering this long with the listener wanting to hear something → treat the link as dead. */
const STALL_MS = 12_000;
const RECOVER_WAITS = [0, 3000, 8000];

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

interface Engine {
  /** episode whose source is currently on the element */
  loadedId: string | null;
  pendingSeek: number;
  expiresAt: number | null;
  /** the listener wants sound (set by play, cleared by a real pause) */
  intent: boolean;
  lastTime: number;
  retries: number;
  retryBase: number;
  token: number;
  stall: ReturnType<typeof setTimeout> | undefined;
  lastSync: number;
  prefetch: { id: string; source: PlaySource } | null;
  prefetchTried: Set<string>;
  /** episode the `ended` handler already swapped in synchronously */
  advancedTo: string | null;
  load: (item: PlayerItem, seek: number, autoplay: boolean, patient?: boolean) => Promise<void>;
  play: () => void;
}

/**
 * Drives the shared <audio> element (see audio-element.ts) for the global podcast player: loading signed URLs,
 * lock-screen controls, gapless-ish auto-advance while the screen is off, and recovery from expired links.
 * Mounted for as long as a podcast is the current item; the element itself outlives it.
 */
export function useAudioEngine(item: PlayerItem, nonce: number) {
  const [status, setStatus] = React.useState<AudioStatus>("loading");
  const trackView = useViewTracker(item.id, "podcast");
  const progress = useProgressSaver(item.id);

  // Long-lived listeners read the latest values from here instead of capturing stale closures.
  const live = React.useRef({ item, trackView, progress });
  React.useLayoutEffect(() => {
    live.current = { item, trackView, progress };
  });

  const E = React.useRef<Engine | null>(null);
  if (!E.current) {
    E.current = {
      loadedId: null,
      pendingSeek: 0,
      expiresAt: null,
      intent: false,
      lastTime: 0,
      retries: 0,
      retryBase: 0,
      token: 0,
      stall: undefined,
      lastSync: 0,
      prefetch: null,
      prefetchTried: new Set(),
      advancedTo: null,
      load: async () => {},
      play: () => {},
    };
  }

  // ── Element, events, lock screen ──
  React.useEffect(() => {
    const a = getAudio();
    const e = E.current;
    if (!a || !e) return;
    const st = () => usePlayer.getState();
    const cur = () => live.current.item;
    const ms = "mediaSession" in navigator ? navigator.mediaSession : null;

    const setState = (s: MediaSessionPlaybackState) => {
      try {
        if (ms) ms.playbackState = s;
      } catch {}
    };
    /** Keeps the lock-screen scrubber in step with reality. */
    const position = () => {
      const d = a.duration;
      if (!ms || !Number.isFinite(d) || d <= 0) return;
      try {
        ms.setPositionState({ duration: d, position: Math.min(Math.max(a.currentTime, 0), d), playbackRate: a.playbackRate || 1 });
      } catch {}
    };

    const playNow = () => {
      e.intent = true;
      a.play().catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return; // a newer source replaced this request
        // The browser refused to start by itself (no tap yet): show the play button honestly.
        e.intent = false;
        st().sync({ paused: true });
      });
    };
    e.play = playNow;

    const setSource = (it: PlayerItem, src: PlaySource, seek: number, autoplay: boolean) => {
      clearTimeout(e.stall);
      e.loadedId = it.id;
      e.prefetchTried.delete(it.id);
      e.pendingSeek = seek > 0 ? seek : 0;
      e.expiresAt = src.expiresAt ?? null;
      e.lastTime = seek > 0 ? seek : 0;
      a.src = src.src;
      a.preload = "auto";
      if (autoplay) playNow();
      else e.intent = false;
    };

    /** Fetch a signed URL and put it on the element. `patient` keeps trying through a flaky connection. */
    e.load = async (it, seek, autoplay, patient = false) => {
      const token = ++e.token;
      let r: PlayFetch = { status: "unavailable" };
      for (const wait of patient ? RECOVER_WAITS : [0]) {
        if (wait) await sleep(wait);
        if (token !== e.token) return;
        r = await fetchPlaySource(it.id).catch((): PlayFetch => ({ status: "unavailable" }));
        if (token !== e.token) return;
        if (r.status !== "unavailable") break;
      }
      if (r.status === "members_only") {
        setStatus("members_only");
        return;
      }
      if (r.status !== "ok") {
        e.intent = false;
        a.pause();
        setStatus("unavailable");
        st().sync({ paused: true });
        return;
      }
      setStatus("ready");
      setSource(it, r.source, seek, autoplay);
    };

    /** Link expired or the network dropped mid-episode: new link, same position, keep playing. */
    const recover = () => {
      const it = cur();
      if (!it || e.loadedId !== it.id) return;
      if (e.retries >= MAX_RECOVERIES) {
        e.intent = false;
        setStatus("unavailable");
        st().sync({ paused: true });
        return;
      }
      e.retries++;
      e.retryBase = e.lastTime;
      const at = Math.max(a.currentTime || 0, e.lastTime);
      const wasPlaying = e.intent || !a.paused;
      e.loadedId = null; // events from the dying source are ignored until the new one is set
      void e.load(it, at, wasPlaying, true);
    };

    /** Start (or resume) playback, refreshing the link first if it has expired while paused. */
    const resume = () => {
      const it = cur();
      if (it && e.loadedId === it.id && e.expiresAt && Date.now() > e.expiresAt) {
        e.retries = 0;
        void e.load(it, Math.max(a.currentTime || 0, e.lastTime), true, true);
        return;
      }
      playNow();
    };

    const armStall = () => {
      clearTimeout(e.stall);
      if (!e.intent) return;
      e.stall = setTimeout(() => {
        if (e.intent && a.readyState < 3) recover();
      }, STALL_MS);
    };

    const maybePrefetch = (duration: number, t: number) => {
      if (!duration || duration - t > PREFETCH_WITHIN_SEC) return;
      const n = st().queue[0];
      if (!n || n.type !== "podcast" || e.prefetchTried.has(n.id)) return;
      e.prefetchTried.add(n.id);
      void fetchPlaySource(n.id)
        .then((r) => {
          if (r.status === "ok") e.prefetch = { id: n.id, source: r.source };
        })
        .catch(() => {});
    };

    /** Move to the next episode. With a prefetched URL the swap + play() happen synchronously (lock-screen safe). */
    const advance = () => {
      const s = st();
      const n = s.queue[0];
      const pf = e.prefetch;
      if (n && n.type === "podcast" && pf?.id === n.id && (!pf.source.expiresAt || pf.source.expiresAt > Date.now())) {
        e.advancedTo = n.id;
        e.retries = 0;
        setSource(n, pf.source, n.startAt ?? 0, true);
        e.prefetch = null;
        setStatus("ready");
        setState("playing");
      }
      s.next();
    };

    const seekBy = (delta: number) => {
      const d = Number.isFinite(a.duration) ? a.duration : Infinity;
      a.currentTime = Math.min(Math.max(0, a.currentTime + delta), d);
      e.lastTime = a.currentTime;
      st().sync({ currentTime: a.currentTime });
      position();
    };
    const seekTo = (t: number) => {
      a.currentTime = t;
      e.lastTime = t;
      st().sync({ currentTime: t });
      position();
    };
    const previousTrack = () => {
      if (a.currentTime > 3 || !st().history.length) seekTo(0);
      else st().previous();
    };

    // ── Element events ──
    const live_ = () => {
      const it = cur();
      return it && e.loadedId === it.id ? it : null;
    };
    const on: Record<string, () => void> = {
      play: () => {
        if (!live_()) return;
        e.intent = true;
        st().sync({ paused: false });
        setState("playing");
        position();
      },
      pause: () => {
        if (!live_()) return;
        live.current.progress.flush();
        if (a.ended) return; // handled by `ended`
        e.intent = false;
        clearTimeout(e.stall);
        st().sync({ paused: true, currentTime: a.currentTime });
        setState("paused");
        position();
      },
      playing: () => clearTimeout(e.stall),
      canplay: () => clearTimeout(e.stall),
      waiting: armStall,
      stalled: armStall,
      loadedmetadata: () => {
        if (!live_()) return;
        if (e.pendingSeek > 0) {
          a.currentTime = e.pendingSeek;
          e.pendingSeek = 0;
        }
        if (Number.isFinite(a.duration) && a.duration > 0) st().sync({ duration: a.duration });
        position();
      },
      durationchange: () => {
        if (!live_()) return;
        if (Number.isFinite(a.duration) && a.duration > 0) st().sync({ duration: a.duration });
        position();
      },
      ratechange: () => {
        st().sync({ rate: a.playbackRate });
        position();
      },
      seeked: () => {
        if (live_()) position();
      },
      timeupdate: () => {
        const it = live_();
        if (!it) return;
        const t = a.currentTime;
        const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : it.duration;
        e.lastTime = t;
        clearTimeout(e.stall);
        if (e.retries && t - e.retryBase > 30) e.retries = 0;
        live.current.trackView(t, a.paused, d);
        live.current.progress.tick(t, d);
        const now = Date.now();
        if (now - e.lastSync > 250) {
          e.lastSync = now;
          st().sync({ currentTime: t });
          position();
        }
        // Sleep timer is also checked here: setTimeout is throttled / frozen in a backgrounded phone tab.
        const sl = st().sleep;
        if (sl.mode === "time" && now >= sl.at) {
          a.pause();
          st().setSleep({ mode: "off" });
        }
        maybePrefetch(d, t);
      },
      ended: () => {
        const it = live_();
        if (!it) return;
        live.current.progress.flush();
        const s = st();
        if (s.sleep.mode === "end") {
          e.intent = false;
          s.setSleep({ mode: "off" });
          s.sync({ paused: true });
          setState("paused");
          return;
        }
        advance();
      },
      error: () => {
        if (!live_() || a.error?.code === 1) return; // 1 = aborted on purpose
        recover();
      },
    };
    for (const [ev, h] of Object.entries(on)) a.addEventListener(ev, h);

    // Coming back from the background: the page may have been frozen, so re-read the truth from the element.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !live_()) return;
      st().sync({ paused: a.paused, currentTime: a.currentTime, rate: a.playbackRate });
      position();
      if (e.intent && !a.paused && a.readyState < 3) armStall();
    };
    document.addEventListener("visibilitychange", onVisible);
    const onOnline = () => {
      if (live_() && e.intent && a.readyState < 3) {
        e.retries = 0;
        recover();
      }
    };
    window.addEventListener("online", onOnline);

    // ── Controls for the UI and other components ──
    st().setControls({
      toggle: () => (a.paused ? resume() : a.pause()),
      seek: seekTo,
      setRate: (r) => {
        a.defaultPlaybackRate = r; // survives the next episode
        a.playbackRate = r;
      },
    });

    // ── Lock screen / notification / headset buttons ──
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", resume],
      ["pause", () => a.pause()],
      ["stop", () => st().close()],
      ["seekbackward", (d) => seekBy(-(d.seekOffset || SEEK_BACK))],
      ["seekforward", (d) => seekBy(d.seekOffset || SEEK_FWD)],
      [
        "seekto",
        (d) => {
          if (d.seekTime == null) return;
          if (d.fastSeek && typeof a.fastSeek === "function") a.fastSeek(d.seekTime);
          else a.currentTime = d.seekTime;
          e.lastTime = d.seekTime;
          position();
        },
      ],
      ["previoustrack", previousTrack],
    ];
    const setHandler = (action: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms?.setActionHandler(action, h);
      } catch {}
    };
    for (const [action, h] of handlers) setHandler(action, h);
    // "Next" only makes sense while something is queued; hiding it otherwise keeps the lock screen honest.
    const syncNext = () => setHandler("nexttrack", st().queue.length ? advance : null);
    syncNext();
    const unsub = usePlayer.subscribe((s, prev) => {
      if (s.queue.length !== prev.queue.length) syncNext();
    });

    return () => {
      unsub();
      for (const [ev, h] of Object.entries(on)) a.removeEventListener(ev, h);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      clearTimeout(e.stall);
      e.token++;
      e.loadedId = null;
      e.intent = false;
      e.prefetch = null;
      st().setControls(null);
      a.pause();
      a.removeAttribute("src");
      a.load();
      for (const [action] of handlers) setHandler(action, null);
      setHandler("nexttrack", null);
      if (ms) {
        try {
          ms.metadata = null;
          ms.playbackState = "none";
        } catch {}
      }
    };
  }, []);

  // ── Which episode is on the element ──
  React.useEffect(() => {
    const a = getAudio();
    const e = E.current;
    if (!a || !e) return;
    e.retries = 0;
    if (e.advancedTo === item.id) {
      // The `ended` handler already put this episode on the element and pressed play.
      e.advancedTo = null;
      return;
    }
    if (e.loadedId === item.id && a.src) {
      // Same episode asked to play again (e.g. from a timestamp link): seek, no new download.
      const to = live.current.item.startAt ?? 0;
      a.currentTime = to;
      e.lastTime = to;
      e.play();
      return;
    }
    // Another episode was playing: silence it now rather than after the new link arrives.
    e.loadedId = null;
    a.pause();
    setStatus("loading");
    e.lastTime = live.current.item.startAt ?? 0;
    void e.load(item, live.current.item.startAt ?? 0, true);
    return () => {
      e.token++; // a slower, older fetch must not overwrite the newer one
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, nonce]);

  // ── Lock-screen card ──
  React.useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      const art = item.thumb ? ["96x96", "256x256", "512x512"].map((sizes) => ({ src: item.thumb!, sizes })) : [];
      navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: "TOPJ_GRIND", album: "GRIND TALK", artwork: art });
    } catch {}
  }, [item.id, item.title, item.thumb]);

  const retry = React.useCallback(() => {
    const e = E.current;
    const it = live.current.item;
    if (!e) return;
    e.retries = 0;
    setStatus("loading");
    void e.load(it, Math.max(e.lastTime, it.startAt ?? 0), true);
  }, []);

  return { status, retry };
}
