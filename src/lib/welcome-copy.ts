import { PLANS } from "@/lib/plans";
import type { OnboardingStage } from "@/lib/onboarding";

/**
 * Welcome email copy (JR's voice: ผม/ครับ, short sentences, no em dash, no stock motivational lines).
 * Sent on day 0 (right after the onboarding question, or by the daily cron if they never answered), then days 1, 3 and 7.
 * Edit the words here; layout lives in src/lib/server/welcome-emails.ts.
 *
 * Placeholders filled at send time: none. `{name}` style tokens are NOT used: the renderer greets by name itself.
 * `stage` is null when the person skipped the question.
 */
export type WelcomeStep = 0 | 1 | 3 | 7;
export const WELCOME_STEPS: WelcomeStep[] = [0, 1, 3, 7];

export interface WelcomeCopy {
  subject: string;
  /** Hidden preview line in the inbox list */
  preheader: string;
  /** Paragraphs, in order. Plain text (escaped by the renderer). */
  body: string[];
  /** Main button */
  cta: { label: string; target: WelcomeTarget };
  /** Optional small text link under the button */
  secondary?: { label: string; target: WelcomeTarget };
}

/**
 * Where a button goes. Resolved at send time:
 *  - clip1/clip2/clip3: that clip of the person's path; falls back to /welcome when the path has fewer clips or no stage
 *  - welcome: /welcome (pick or see the path) · community: /community · membership: /membership
 */
export type WelcomeTarget = "clip1" | "clip2" | "clip3" | "welcome" | "community" | "membership";

const DAY0_STAGE_LINE: Record<OnboardingStage, string> = {
  idea: "คุณบอกว่ายังไม่รู้จะขายอะไร ผมบอกตรงๆ คนส่วนใหญ่ไม่ใช่ไม่มีอะไรจะขาย แค่ยังไม่รู้ว่าสิ่งที่มีอยู่มันขายได้",
  build: "คุณบอกว่ามีไอเดียแล้วแต่ทำไม่เสร็จ ส่วนใหญ่ไม่ใช่เพราะไม่เก่งพอ แต่เพราะชิ้นแรกใหญ่เกินไป",
  sell: "คุณบอกว่าทำแล้วแต่ยังขายไม่ได้ ส่วนใหญ่สินค้าไม่ได้แย่ แต่คนยังไม่เชื่อ หรือยังไม่เห็นว่ามันช่วยเขาได้ยังไง",
};

const price = (n: number) => n.toLocaleString("en-US");

export function welcomeCopy(step: WelcomeStep, stage: OnboardingStage | null, isMember: boolean): WelcomeCopy {
  switch (step) {
    case 0:
      return {
        subject: "เริ่มตรงนี้ก่อน อย่าเพิ่งดูทุกคลิป",
        preheader: "วันนี้ดูคลิปเดียวพอ แล้วไปลงมือ",
        body: [
          "ขอบคุณที่สมัครเข้ามาครับ ผม JR",
          "ขอเรื่องเดียว อย่าเพิ่งไล่ดูทุกคลิปในเว็บ คนที่ดูเยอะที่สุดมักเป็นคนที่ยังไม่ได้ลงมือสักอย่าง",
          stage
            ? DAY0_STAGE_LINE[stage]
            : "คุณยังไม่ได้บอกผมว่าตอนนี้อยู่ตรงไหน กดตอบ 1 ข้อก่อน ผมจะจัดคลิปให้ตรงกับจุดที่คุณอยู่",
          stage ? "ผมจัดเส้นทางให้คุณแล้ว วันนี้ดูคลิปแรกคลิปเดียวพอ แล้วไปลงมือ" : "ใช้เวลาไม่ถึง 10 วินาที",
        ],
        cta: stage ? { label: "ดูคลิปแรกของคุณ", target: "clip1" } : { label: "ตอบ 1 ข้อ", target: "welcome" },
      };
    case 1:
      return {
        subject: "เมื่อวานดูจบหรือยัง",
        preheader: "คนที่หยุดตั้งแต่วันแรก ส่วนใหญ่ไม่กลับมาอีกเลย",
        body: [
          "ถามตรงๆ เมื่อวานดูคลิปแรกจบหรือยัง",
          "ถ้ายัง ไม่เป็นไร แต่อย่าปล่อยให้เกินวันนี้ คนที่หยุดตั้งแต่วันแรก ส่วนใหญ่ไม่กลับมาอีกเลย",
          "ถ้าดูแล้ว ไปต่อคลิปที่ 2 ในเส้นทางของคุณได้เลย วันละคลิปพอ ที่เหลือคือเวลาลงมือ",
        ],
        cta: { label: "ดูคลิปถัดไป", target: stage ? "clip2" : "welcome" },
      };
    case 3:
      return {
        subject: "วันที่ 3 คือวันที่คนส่วนใหญ่เลิก",
        preheader: "ไม่ใช่เพราะยาก แต่เพราะไม่มีใครรู้ว่าเขาหายไป",
        body: [
          "วันที่ 3 คือวันที่คนส่วนใหญ่เลิก ไม่ใช่เพราะมันยาก แต่เพราะไม่มีใครรู้ว่าเขาหายไป",
          "ในเว็บมีชุมชนอยู่ เข้าไปโพสต์ประโยคเดียวว่าตอนนี้คุณกำลังทำอะไร คนในนั้นกำลังทำเรื่องเดียวกับคุณ",
          "พอมีคนรู้ว่าคุณกำลังทำอะไร คุณจะเลิกยากขึ้นเยอะ",
        ],
        cta: { label: "ไปโพสต์ในชุมชน", target: "community" },
        secondary: { label: "หรือดูคลิปที่ 3 ในเส้นทางของคุณ", target: stage ? "clip3" : "welcome" },
      };
    case 7:
      return isMember
        ? {
            subject: "1 สัปดาห์แล้ว คุณขยับไปถึงไหน",
            preheader: "ผมไม่ถามว่าดูไปกี่คลิป",
            body: [
              "ครบ 1 สัปดาห์ที่คุณเข้ามาแล้วครับ",
              "ผมไม่ถามว่าดูไปกี่คลิป ผมถามว่าคุณลงมือไปกี่อย่าง",
              "คุณเป็นสมาชิกแล้ว ทุกคลิปเปิดให้คุณหมด ใช้ให้คุ้ม แต่ดูแล้วต้องลงมือ",
              "ไม่ใช่ว่าคุณไม่มีอะไรจะขาย คุณแค่ไม่รู้เฉยๆ ว่าสิ่งที่คุณมีอยู่มันขายได้",
            ],
            cta: { label: "ไปต่อในเส้นทางของคุณ", target: "welcome" },
          }
        : {
            subject: "1 สัปดาห์แล้ว คุณขยับไปถึงไหน",
            preheader: "ผมไม่ถามว่าดูไปกี่คลิป",
            body: [
              "ครบ 1 สัปดาห์ที่คุณสมัครเข้ามาแล้วครับ",
              "ผมไม่ถามว่าดูไปกี่คลิป ผมถามว่าคุณลงมือไปกี่อย่าง",
              "ถ้ายังไม่ได้ลงมือเลย กลับไปเริ่มคลิปแรกใหม่ ไม่มีใครว่า",
              `ถ้าลงมือแล้วและอยากไปให้สุด สมาชิกดูได้ทุกคลิปในเว็บ รวมคลิปที่ล็อกไว้ทั้งหมด รายเดือน ${price(PLANS.monthly.price)} บาท หรือรายปี ${price(PLANS.yearly.price)} บาท`,
              "ไม่ใช่ว่าคุณไม่มีอะไรจะขาย คุณแค่ไม่รู้เฉยๆ ว่าสิ่งที่คุณมีอยู่มันขายได้",
            ],
            cta: { label: "ดูสิ่งที่สมาชิกได้", target: "membership" },
            secondary: { label: "หรือกลับไปเริ่มคลิปแรก", target: stage ? "clip1" : "welcome" },
          };
  }
}
