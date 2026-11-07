"use server";

import { HttpError } from "@/lib/server/auth";
import { saveOnboardingSettings } from "@/lib/server/onboarding";
import type { OnboardingStage } from "@/lib/onboarding";

export type OnboardingSaveResult = { ok: true } | { ok: false; error: string };

/** Studio → จัดหน้า Home → เส้นทางเริ่มต้น. Admin check happens inside saveOnboardingSettings. */
export async function saveOnboardingPathsAction(paths: Record<OnboardingStage, string[]>): Promise<OnboardingSaveResult> {
  try {
    await saveOnboardingSettings(paths);
    return { ok: true };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}
