import "server-only";
import { cache } from "react";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { adminDb } from "@/lib/supabase/clients";
import { HttpError, requireAdmin } from "./auth";
import { audit } from "./mutations";
import { getContentsByIds, isUuid } from "./queries";
import { EMPTY_ONBOARDING, isStage, STAGES, type OnboardingSettings, type OnboardingStage } from "@/lib/onboarding";
import type { Content } from "@/lib/types";

/** Starter paths (site_settings key "onboarding") + the per-person onboarding state (profiles.onboarding_stage / onboarded_at, migration 0020). */

export const ONBOARDING_TAG = "onboarding";
export const PATH_MAX = 10;
const NEW_ACCOUNT_MS = 24 * 3_600_000;
const FRESH_CONFIRM_MS = 15 * 60_000;
/** Accounts older than this never get the welcome flow pushed at them (matches the welcome_due() cut-off). */
export const WELCOME_LAUNCH_MS = new Date("2026-11-07T00:00:00+07:00").getTime();

// ───────────────────────── Settings ─────────────────────────
const loadSettings = unstable_cache(
  async (): Promise<OnboardingSettings> => {
    const { data, error } = await adminDb().from("site_settings").select("value").eq("key", "onboarding").maybeSingle();
    if (error) throw new Error(`onboarding settings: ${error.message}`);
    return normalize(data?.value);
  },
  ["tg-onboarding-v1"],
  { tags: [ONBOARDING_TAG], revalidate: 60 },
);

function normalize(v: unknown): OnboardingSettings {
  const paths = (v as Partial<OnboardingSettings> | null)?.paths;
  const out: OnboardingSettings = { paths: { idea: [], build: [], sell: [] } };
  for (const s of STAGES) {
    const ids = (paths as Record<string, unknown> | undefined)?.[s.key];
    if (Array.isArray(ids)) out.paths[s.key] = [...new Set(ids.filter((x): x is string => typeof x === "string" && isUuid(x)))].slice(0, PATH_MAX);
  }
  return out;
}

export async function onboardingSettings(): Promise<OnboardingSettings> {
  try {
    return await loadSettings();
  } catch (e) {
    console.error("[onboarding]", e);
    return EMPTY_ONBOARDING;
  }
}

/** Studio: replace all three paths. Admin only. */
export async function saveOnboardingSettings(input: Partial<Record<OnboardingStage, string[]>>) {
  const a = await requireAdmin();
  const value: OnboardingSettings = { paths: { idea: [], build: [], sell: [] } };
  for (const s of STAGES) {
    const ids = input[s.key] ?? [];
    if (!Array.isArray(ids)) throw new HttpError(400, "ข้อมูลไม่ถูกต้อง");
    if (ids.some((x) => typeof x !== "string" || !isUuid(x))) throw new HttpError(400, "รหัสคลิปไม่ถูกต้อง");
    const unique = [...new Set(ids)];
    if (unique.length > PATH_MAX) throw new HttpError(400, `แต่ละเส้นทางใส่ได้ไม่เกิน ${PATH_MAX} คลิป`);
    value.paths[s.key] = unique;
  }
  const { error } = await adminDb().from("site_settings").upsert({ key: "onboarding", value }, { onConflict: "key" });
  if (error) throw new Error(`save onboarding: ${error.message}`);
  await audit(a.id, "onboarding.update", "settings", "onboarding");
  revalidateTag(ONBOARDING_TAG);
  revalidatePath("/welcome");
  revalidatePath("/", "page");
}

/** The live, listed clips of one path, in the owner's order (clips that are unpublished or deleted drop out). */
export async function pathFor(stage: OnboardingStage): Promise<Content[]> {
  const s = await onboardingSettings();
  return getContentsByIds(s.paths[stage]);
}

// ───────────────────────── Per person ─────────────────────────
export interface OnboardingState {
  stage: OnboardingStage | null;
  /** answered or skipped */
  onboarded: boolean;
}

/**
 * Cheap single-row read. If migration 0020 is not applied yet the columns do not exist: report "already onboarded"
 * so nothing is shown (and nothing breaks) until the database is ready.
 */
export const onboardingState = cache(async (userId: string): Promise<OnboardingState> => {
  const { data, error } = await adminDb().from("profiles").select("onboarding_stage, onboarded_at").eq("id", userId).maybeSingle();
  if (error || !data) return { stage: null, onboarded: true };
  return { stage: isStage(data.onboarding_stage) ? data.onboarding_stage : null, onboarded: !!data.onboarded_at };
});

/**
 * Brand-new account that has not been through onboarding: not answered/skipped yet, and the auth user was created in the last 24 hours
 * (or confirmed its email in the last 15 minutes, for people who sign up and confirm much later; accounts from before launch never count).
 * Pass `user` when you already have it (auth callback) to save a lookup.
 */
export async function isNewAccount(userId: string, user?: { created_at?: string | null; email_confirmed_at?: string | null }): Promise<boolean> {
  try {
    const db = adminDb();
    const { data: p, error } = await db.from("profiles").select("onboarded_at").eq("id", userId).maybeSingle();
    if (error || !p || p.onboarded_at) return false;
    let u = user;
    if (!u?.created_at) {
      const r = await db.auth.admin.getUserById(userId);
      u = r.data.user ?? undefined;
    }
    if (!u?.created_at) return false;
    const now = Date.now();
    const created = new Date(u.created_at).getTime();
    if (now - created <= NEW_ACCOUNT_MS) return true;
    const confirmed = u.email_confirmed_at ? new Date(u.email_confirmed_at).getTime() : 0;
    return created >= WELCOME_LAUNCH_MS && now - confirmed <= FRESH_CONFIRM_MS;
  } catch {
    return false;
  }
}
