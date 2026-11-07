import { analyticsEnabled, loadAnalytics } from "@/lib/analytics";

// Runs once in the browser before hydration (Next 15.3+). PostHog is downloaded only after the page
// has loaded and the browser is idle, so it never competes with the hero image or hydration on phones.
// Nothing is sent unless NEXT_PUBLIC_POSTHOG_KEY is set.
if (analyticsEnabled()) {
  const start = () => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(() => void loadAnalytics(), { timeout: 4000 });
    else setTimeout(() => void loadAnalytics(), 1500);
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
