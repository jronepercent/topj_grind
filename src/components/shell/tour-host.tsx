"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { startTour, TOUR_EVENT, TOURED_KEY, type TourSource } from "@/lib/tour";

// The tour UI loads only when the tour actually starts.
const SiteTour = dynamic(() => import("./site-tour"), { ssr: false });

/** Mounted once in the site shell; opens the tour whenever startTour() is called. */
export function TourHost() {
  const [source, setSource] = React.useState<TourSource | null>(null);
  React.useEffect(() => {
    const on = (e: Event) => setSource((e as CustomEvent<TourSource>).detail ?? "menu");
    window.addEventListener(TOUR_EVENT, on);
    return () => window.removeEventListener(TOUR_EVENT, on);
  }, []);
  const close = React.useCallback(() => setSource(null), []);
  return source ? <SiteTour source={source} onClose={close} /> : null;
}

/** Home: rendered only when the server says this person has not seen the tour yet (profiles.toured_at is null). */
export function TourAutoStart() {
  React.useEffect(() => {
    try {
      if (localStorage.getItem(TOURED_KEY)) return;
    } catch {}
    // Let the page settle (hero image, fonts) so the spotlight lands on final positions.
    const t = window.setTimeout(() => {
      // Never on top of another dialog (paywall, sign-in prompt, share).
      if (document.querySelector('[role="dialog"]')) return;
      startTour("auto");
    }, 900);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

/** /about and other pages: a plain button that replays the tour. */
export function TourButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => startTour("about")} className={className}>
      {children}
    </button>
  );
}
