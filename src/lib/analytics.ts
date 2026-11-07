"use client";
import type { PostHog } from "posthog-js";

/**
 * Product analytics (PostHog). Everything here is a no-op until NEXT_PUBLIC_POSTHOG_KEY is set,
 * so local dev and preview deploys send nothing.
 *
 * posthog-js is ~118 kB gzipped, so it is NOT in the page bundle: src/instrumentation-client.ts calls
 * loadAnalytics() once the page has loaded and the browser is idle. Calls made before that are queued.
 * Never `import posthog from "posthog-js"` anywhere else — use the helpers below.
 *
 * Funnel the events below are built for:
 *   $pageview → login_gate_shown → signup_submitted → onboarding_answered → video_completed → checkout_started → membership_paid
 */
export type AnalyticsEvent =
  | "login_gate_shown"
  | "paywall_shown"
  | "signup_submitted"
  | "login_submitted"
  | "onboarding_viewed"
  | "onboarding_answered"
  | "onboarding_skipped"
  | "path_clip_clicked"
  | "video_started"
  | "video_completed"
  | "checkout_started"
  | "membership_paid"
  | "product_checkout_started"
  | "product_purchased"
  | "sample_downloaded"
  | "freebie_claimed"
  | "community_post_created"
  | "testimonial_played";

/**
 * PostHog project token (US Cloud, project 717369). It is a public client token: it ships in every page's JS anyway,
 * so it lives here instead of a Vercel env var. NEXT_PUBLIC_POSTHOG_KEY overrides it (Config, not Secret).
 * The built-in token only sends from the real domain, so localhost and preview deploys stay out of the data.
 */
const PUBLIC_TOKEN = "phc_rYnFGkZn6u7asJdRmdjgUYZKNin9Vw4fqpM735GCXFpw";
const LIVE_HOSTS = ["topjgrind.com", "www.topjgrind.com"];
const ENV_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const KEY = ENV_KEY || PUBLIC_TOKEN;
export const analyticsEnabled = () =>
  typeof window !== "undefined" && (!!ENV_KEY || LIVE_HOSTS.includes(window.location.hostname));

let ph: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
const queue: ((p: PostHog) => void)[] = [];

/** Downloads and starts PostHog once. Safe to call many times. */
export function loadAnalytics(): Promise<PostHog | null> {
  if (!analyticsEnabled()) return Promise.resolve(null);
  loading ??= import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(KEY!, {
        api_host: "/ingest", // reverse proxy in next.config.ts (ad blockers drop posthog.com)
        ui_host: "https://us.posthog.com",
        defaults: "2025-05-24", // SPA pageviews via history changes
        person_profiles: "identified_only",
        capture_pageleave: true,
        session_recording: { maskAllInputs: true },
        // Each of these pulls in its own script and costs main-thread time on phones (Lighthouse TBT went 100 → 1,200 ms
        // with them on). We use none of them; turn one back on only if it earns its weight.
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        disable_web_experiments: true,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_performance: false,
        capture_exceptions: false,
        // Never record the admin area.
        before_send: (event) => {
          const url = event?.properties?.$current_url;
          if (typeof url === "string") {
            try {
              if (new URL(url).pathname.startsWith("/studio")) return null;
            } catch {}
          }
          return event;
        },
      });
      ph = posthog;
      for (const fn of queue.splice(0)) run(fn);
      return posthog;
    })
    .catch(() => null);
  return loading;
}

function run(fn: (p: PostHog) => void) {
  try {
    if (ph) fn(ph);
  } catch {
    /* analytics must never break the page */
  }
}

function withPostHog(fn: (p: PostHog) => void) {
  if (!analyticsEnabled()) return;
  if (ph) run(fn);
  else queue.push(fn);
}

/** Fire-and-forget. Never throws, never blocks the UI. Do not put emails, names or free text in props. */
export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean | null | undefined>) {
  withPostHog((p) => p.capture(event, props));
}

/** Who is browsing. Admins are never tracked; signing out starts a fresh anonymous identity. */
export function identifyViewer(v: { id: string; isAdmin: boolean; isMember: boolean }) {
  withPostHog((p) => {
    if (v.isAdmin) return p.opt_out_capturing();
    if (p.has_opted_out_capturing()) p.opt_in_capturing();
    p.identify(v.id, { is_member: v.isMember });
  });
}

export function resetViewer() {
  withPostHog((p) => p.reset());
}
