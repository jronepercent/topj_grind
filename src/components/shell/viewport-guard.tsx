"use client";
import * as React from "react";

type FsDocument = Document & { webkitFullscreenElement?: Element | null };

function inFullscreen() {
  return !!(document.fullscreenElement ?? (document as FsDocument).webkitFullscreenElement);
}

/**
 * Phones: no page zoom (pinch, double-tap, input focus) except while a video is fullscreen.
 * Also pins bottom bars to the real screen bottom: Chrome iOS can leave the layout viewport
 * short of the screen after its toolbar hides, so `.tg-vv-bottom` elements are shifted down
 * by the gap via --vv-shift.
 */
export function ViewportGuard() {
  React.useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const locked = meta?.content ?? "";
    const free = locked
      .split(",")
      .map((p) => p.trim())
      .filter((p) => !/^(maximum-scale|user-scalable)=/.test(p))
      .join(", ");

    const onFullscreen = () => meta?.setAttribute("content", inFullscreen() ? free : locked);
    // iOS ignores user-scalable=no for pinch; its gesture events still can be cancelled.
    const onGesture = (e: Event) => {
      if (!inFullscreen()) e.preventDefault();
    };

    const root = document.documentElement;
    const vv = window.visualViewport;
    let frame = 0;
    const syncShift = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Only push down (screen bottom below layout bottom); the keyboard case stays as the browser does it.
        const gap = vv ? Math.max(0, Math.round(vv.offsetTop + vv.height - window.innerHeight)) : 0;
        root.style.setProperty("--vv-shift", `${gap}px`);
      });
    };

    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    document.addEventListener("gesturestart", onGesture, { passive: false });
    document.addEventListener("gesturechange", onGesture, { passive: false });
    vv?.addEventListener("resize", syncShift);
    vv?.addEventListener("scroll", syncShift);
    window.addEventListener("resize", syncShift);
    window.addEventListener("scroll", syncShift, { passive: true });
    syncShift();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
      document.removeEventListener("gesturestart", onGesture);
      document.removeEventListener("gesturechange", onGesture);
      vv?.removeEventListener("resize", syncShift);
      vv?.removeEventListener("scroll", syncShift);
      window.removeEventListener("resize", syncShift);
      window.removeEventListener("scroll", syncShift);
      if (meta) meta.content = locked;
    };
  }, []);
  return null;
}
