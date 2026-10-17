import type { ContentType } from "./types";

/**
 * One rule for what counts as a view, shared by the browser and the server:
 * 30 seconds of real watching, or half of a Grind clip if that is shorter.
 */
export function viewThresholdSec(type: ContentType, durationSec: number) {
  if (type === "short" && durationSec > 0) return Math.min(30, durationSec * 0.5);
  return 30;
}

/** A clip counts as finished at 95% (resume position resets to 0). */
export const COMPLETE_RATIO = 0.95;

/** How often watch position is saved while playing. */
export const PROGRESS_SAVE_MS = 10_000;
