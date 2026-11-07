import type { ContentVisibility } from "./types";

/** Seconds a guest may watch / listen to "free" content before the sign-in gate (a lead-capture gate, not DRM). */
export const FREE_PREVIEW_SEC = 60;

/** Preview length for a clip: 60s, or half of a very short clip (never under 10s). */
export function freePreviewSec(durationSec: number) {
  const d = Number.isFinite(durationSec) ? durationSec : 0;
  if (d > 0 && d < 120) return Math.max(10, Math.floor(d / 2));
  return FREE_PREVIEW_SEC;
}

export type Access = "ok" | "login" | "members";

/** public → ok · free → ok when signed in, else "login" · members → ok for admins / members / course buyers, else "members". */
export function contentAccess(
  viewer: { is_member: boolean; is_admin: boolean } | null | undefined,
  visibility: ContentVisibility,
  unlocked?: boolean,
): Access {
  if (visibility === "public") return "ok";
  if (visibility === "free") return viewer ? "ok" : "login";
  if (viewer?.is_admin || viewer?.is_member || unlocked) return "ok";
  return "members";
}
