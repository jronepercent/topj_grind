"use client";

/**
 * The one <audio> element behind every podcast. It lives on document.body — outside React and outside the
 * route tree — so it is never torn down by navigation, and swapping `src` on the same element keeps the
 * permission to play that the browser granted after the listener's first tap (iOS Safari is strict about this,
 * especially when the screen is locked and the next episode must start by itself).
 */
let el: HTMLAudioElement | null = null;
let unlocked = false;

// A valid WAV with zero samples: just enough for play() to succeed inside a tap.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

export function getAudio(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  if (!el) {
    el = document.createElement("audio");
    el.preload = "auto";
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.setAttribute("x-webkit-airplay", "allow");
    el.setAttribute("aria-hidden", "true");
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Call synchronously from the tap that starts playback. The real source is only known after a network round
 * trip (and a lazy-loaded chunk), by which time the tap is over — so play a silent clip now to "unlock" the element.
 */
export function unlockAudio() {
  const a = getAudio();
  if (!a || unlocked || a.src) return;
  a.src = SILENT_WAV;
  a.play().then(
    () => {
      unlocked = true;
    },
    () => {},
  );
}
