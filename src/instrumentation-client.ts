import { analyticsEnabled, loadAnalytics } from "@/lib/analytics";

// Runs once in the browser before hydration (Next 15.3+). PostHog (~118 kB gz plus its recorder) is downloaded
// only on the visitor's first tap/scroll/key, or 8 s after the page has loaded, whichever comes first, so it never
// competes with the first screen on phones. Trade-off: someone who leaves within 8 s without touching anything is
// not counted. Nothing is sent outside topjgrind.com (see src/lib/analytics.ts).
if (analyticsEnabled()) {
  const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
  let started = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = () => {
    if (started) return;
    started = true;
    clearTimeout(timer);
    for (const e of EVENTS) window.removeEventListener(e, start);
    void loadAnalytics();
  };
  for (const e of EVENTS) window.addEventListener(e, start, { once: true, passive: true });
  const arm = () => (timer = setTimeout(start, 8000));
  if (document.readyState === "complete") arm();
  else window.addEventListener("load", arm, { once: true });
}
