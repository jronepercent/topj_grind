/**
 * The one onboarding question after sign-up: "ตอนนี้คุณอยู่ตรงไหน".
 * The answer is saved in profiles.onboarding_stage and picks the person's starter path.
 * Which clips each path holds is set in Studio → จัดหน้า Home (site_settings key "onboarding").
 */
export type OnboardingStage = "idea" | "build" | "sell";

export interface StageInfo {
  key: OnboardingStage;
  /** Answer button title */
  label: string;
  /** One line under the title */
  hint: string;
  /** Name of the starter path shown after answering and on the home page */
  pathTitle: string;
}

export const STAGES: StageInfo[] = [
  { key: "idea", label: "ยังไม่รู้จะขายอะไร", hint: "มีทักษะหรือประสบการณ์ แต่ไม่รู้ว่าจะทำเป็นสินค้าอะไร", pathTitle: "เส้นทาง: หาสินค้าชิ้นแรก" },
  { key: "build", label: "มีไอเดียแล้ว แต่ทำไม่เสร็จ", hint: "รู้ว่าอยากขายอะไร แต่ยังทำสินค้าไม่จบสักชิ้น", pathTitle: "เส้นทาง: ทำสินค้าให้เสร็จ" },
  { key: "sell", label: "ทำแล้ว แต่ยังขายไม่ได้", hint: "มีสินค้าแล้ว แต่ยังไม่มีคนซื้อ หรือขายได้น้อย", pathTitle: "เส้นทาง: ขายให้ได้" },
];

/** Content pages (/watch/…, /podcasts/…): a new account coming from one goes straight back to it; the onboarding question comes after the clip. */
export function isContentPath(next: string): boolean {
  const path = next.split(/[?#]/)[0];
  return /^\/(watch|podcasts)\/[^/]+/.test(path);
}

export const isStage = (v: unknown): v is OnboardingStage => v === "idea" || v === "build" || v === "sell";
export const stageInfo = (s: OnboardingStage) => STAGES.find((x) => x.key === s)!;

/** site_settings key "onboarding" value */
export interface OnboardingSettings {
  paths: Record<OnboardingStage, string[]>; // content ids, in order
}
export const EMPTY_ONBOARDING: OnboardingSettings = { paths: { idea: [], build: [], sell: [] } };
