/**
 * Site tour ("อะไรอยู่ตรงไหน"): the steps, and how to start it from anywhere.
 *
 * Steps point at elements by `data-tour="<name>"`. The same name can sit on several elements (the mini and the full
 * sidebar both carry `nav-home`); the tour uses the first one that is visible right now. A step whose target is not
 * on screen is dropped, so the tour never gets stuck (e.g. the sidebar is not rendered on the watch page).
 *
 * The menus live in different places per screen size (src/components/shell/nav.tsx), so the steps are picked per layout:
 *   phone  (<640px)       bottom tab bar
 *   tablet (640–1023px)   no sidebar: everything is behind the ☰ button
 *   desktop (≥1024px)     sidebar (mini or full)
 */

export type TourLayout = "phone" | "tablet" | "desktop";
export type TourSource = "auto" | "menu" | "about";

export interface TourStep {
  id: string;
  /** data-tour name; null = a centred card with no spotlight */
  target: string | null;
  title: string;
  body: string;
}

export const TOUR_EVENT = "tg:tour";
/** localStorage flag so the auto-start does not fire again before the next server render sees profiles.toured_at. */
export const TOURED_KEY = "tg_toured";

export function tourLayout(width: number): TourLayout {
  return width < 640 ? "phone" : width < 1024 ? "tablet" : "desktop";
}

export function tourSteps(layout: TourLayout, opts: { isMember: boolean }): TourStep[] {
  const nav = (name: string) => (layout === "phone" ? `tab-${name}` : `nav-${name}`);
  const steps: (TourStep | false)[] = [
    {
      id: "intro",
      target: null,
      title: "รู้จักเว็บใน 30 วินาที",
      body: "พาดูว่าอะไรอยู่ตรงไหน จะได้ไม่ต้องเดา กดข้ามได้ทุกเมื่อ",
    },
    {
      id: "search",
      target: layout === "phone" ? "search-btn" : "search",
      title: "ค้นหา",
      body: "หาคลิป บทความ พอดแคสต์ หรือหัวข้อที่อยากรู้ได้จากตรงนี้",
    },
    layout === "tablet" && {
      id: "menu",
      target: "menu",
      title: "เมนูทั้งหมด",
      body: "หน้าแรก ชุมชน พอดแคสต์ Playlist ร้านค้า ของฟรี และคลังของฉัน อยู่ในปุ่มนี้",
    },
    layout !== "tablet" && {
      id: "home",
      target: nav("home"),
      title: "หน้าแรก",
      body: "คลิปใหม่ และเส้นทางที่จัดตามคำตอบของคุณ เริ่มดูจากตรงนี้ได้เลย",
    },
    layout !== "tablet" && {
      id: "community",
      target: nav("community"),
      title: "ชุมชน",
      body: "โพสต์ ถามตอบกับคนที่ทำเรื่องเดียวกัน และอ่านบทความของ JR",
    },
    layout !== "tablet" && {
      id: "podcasts",
      target: nav("podcasts"),
      title: "พอดแคสต์",
      body: "กดฟังแล้วไปหน้าอื่นต่อได้ เสียงยังเล่นอยู่ที่แถบด้านล่าง",
    },
    layout === "phone" && {
      id: "library",
      target: "tab-library",
      title: "คลัง",
      body: "ดูต่อ ดูภายหลัง ที่ถูกใจ ของที่ซื้อ รวมถึงร้านค้าและของฟรี อยู่ในแท็บนี้ทั้งหมด",
    },
    layout === "desktop" && {
      id: "library",
      target: "nav-library",
      title: "คลังของฉัน",
      body: "ดูต่อ ดูภายหลัง ที่ถูกใจ และของที่ซื้อแล้ว ส่วนร้านค้ากับของฟรีอยู่ในเมนูด้านบน",
    },
    !opts.isMember && {
      id: "subscribe",
      target: "subscribe",
      title: "สมัครสมาชิก",
      body: "คลิปที่มีป้ายกุญแจเปิดดูได้เมื่อเป็นสมาชิก กดตรงนี้เพื่อดูราคาและสิทธิ์ที่ได้",
    },
    {
      id: "bell",
      target: "bell",
      title: "การแจ้งเตือน",
      body: "เด้งเตือนเมื่อมีคนตอบคุณ หรือมีคลิปใหม่ลง",
    },
    {
      id: "account",
      target: "account",
      title: "บัญชีของคุณ",
      body: "ดูสถานะสมาชิก ตั้งค่า เปลี่ยนธีม และเปิดทัวร์นี้ซ้ำได้จากเมนูนี้",
    },
  ];
  return steps.filter((s): s is TourStep => !!s);
}

/** First element carrying data-tour=name that is actually on screen. */
export function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (typeof el.checkVisibility === "function" && !el.checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions)) continue;
    return el;
  }
  return null;
}

/** Start the tour from anywhere on the public site (TourHost in the site shell listens). */
export function startTour(source: TourSource) {
  window.dispatchEvent(new CustomEvent<TourSource>(TOUR_EVENT, { detail: source }));
}
