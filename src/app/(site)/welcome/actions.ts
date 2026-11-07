"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { adminDb } from "@/lib/supabase/clients";
import { getViewer } from "@/lib/server/auth";
import { sendWelcomeStep } from "@/lib/server/welcome-emails";
import { pathFor } from "@/lib/server/onboarding";
import { progressMap } from "@/lib/server/queries";
import { contentHref } from "@/lib/format";
import { isStage, type OnboardingStage } from "@/lib/onboarding";

export type OnboardingResult = { ok: true; next?: { href: string; title: string } | null } | { ok: false; error: string };

const FAIL: OnboardingResult = { ok: false, error: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" };

/** Stamp onboarded_at the first time only (answered or skipped), then queue the day-0 email after the response. */
async function markOnboarded(userId: string): Promise<boolean> {
  const { error } = await adminDb().from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", userId).is("onboarded_at", null);
  return !error;
}

function done(userId: string): OnboardingResult {
  // Day-0 email: no-op if it was already sent (welcome_emails row), so changing the answer later never re-sends it.
  after(() => sendWelcomeStep(userId, 0));
  revalidatePath("/welcome");
  revalidatePath("/", "page");
  return { ok: true };
}

/** First clip of the stage's path that is not the current one and not finished by the viewer. */
async function nextInPath(userId: string, stage: OnboardingStage, currentContentId?: string) {
  try {
    const clips = (await pathFor(stage)).filter((c) => c.id !== currentContentId);
    const prog = await progressMap(userId, clips.map((c) => c.id));
    const c = clips.find((x) => !prog[x.id]?.completed);
    return c ? { href: contentHref(c), title: c.title } : null;
  } catch (e) {
    console.error("[onboarding] next:", e);
    return null;
  }
}

export async function chooseStageAction(stage: string, currentContentId?: string): Promise<OnboardingResult> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };
    if (viewer.is_banned || !isStage(stage)) return FAIL;
    const { error } = await adminDb().from("profiles").update({ onboarding_stage: stage }).eq("id", viewer.id);
    if (error) {
      console.error("[onboarding] choose:", error.message);
      return FAIL;
    }
    if (!(await markOnboarded(viewer.id))) return FAIL;
    const res = done(viewer.id);
    return res.ok ? { ...res, next: await nextInPath(viewer.id, stage, currentContentId) } : res;
  } catch (e) {
    console.error("[onboarding] choose:", e);
    return FAIL;
  }
}

export async function skipOnboardingAction(): Promise<OnboardingResult> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };
    if (viewer.is_banned) return FAIL;
    if (!(await markOnboarded(viewer.id))) return FAIL;
    return done(viewer.id);
  } catch (e) {
    console.error("[onboarding] skip:", e);
    return FAIL;
  }
}
