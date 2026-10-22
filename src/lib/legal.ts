/** The three policy pages. Linked from the sidebar, the about page, sign-up and checkout. */
export const LEGAL_LINKS = [
  { href: "/terms", label: "เงื่อนไขการใช้งาน" },
  { href: "/privacy", label: "นโยบายความเป็นส่วนตัว" },
  { href: "/refund", label: "นโยบายการคืนเงิน" },
] as const;

/** Bump when any policy text changes; shown as "ปรับปรุงล่าสุด" on each page. */
export const LEGAL_UPDATED = "2026-10-22";
