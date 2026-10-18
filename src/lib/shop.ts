import type { PaymentMethod } from "@/lib/types";

/**
 * Shop (ร้านค้า) — shared types and formatting. Safe to import from server and client code.
 * Server-only data access lives in src/lib/server/shop.ts.
 */

export type ProductKind = "digital" | "physical";
export type ProductType = "ebook" | "course" | "template" | "file" | "other";
export type ProductStatus = "draft" | "published";

export const PRODUCT_TYPES: ProductType[] = ["ebook", "course", "template", "file", "other"];
export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  ebook: "E-book",
  course: "คอร์สเรียน",
  template: "เทมเพลต",
  file: "ไฟล์ดาวน์โหลด",
  other: "อื่นๆ",
};

export function isProductType(v: unknown): v is ProductType {
  return typeof v === "string" && (PRODUCT_TYPES as string[]).includes(v);
}

/** Limits shared by the editor (client) and the server action; the same numbers sit in 0013_shop.sql. */
export const PRODUCT_LIMITS = {
  title: 200,
  subtitle: 300,
  description: 20_000,
  images: 10,
  /** Price ceiling the editor accepts (numeric(10,2) could hold more, this just catches typos). */
  price: 1_000_000,
  /** Mirrors the bucket's file_size_limit (2 GB). */
  fileBytes: 2 * 1024 * 1024 * 1024,
} as const;

/** What a product card needs — the same shape for the shop grid, the home row and the library. */
export interface ProductCardData {
  id: string;
  title: string;
  subtitle: string | null;
  cover_url: string | null;
  kind: ProductKind;
  product_type: ProductType;
  price_thb: number;
  /** Original price shown struck through (always > price_thb when set). */
  compare_at_thb: number | null;
  is_featured: boolean;
  /** true = the signed-in viewer already owns it (set only when the loader was given a viewer). */
  owned?: boolean;
}

/** Public product page data (never includes the storage path). */
export interface ProductPublic extends ProductCardData {
  description: string;
  images: string[];
  /** A file is attached (digital download). The path itself stays on the server. */
  has_file: boolean;
  file_name: string | null;
  file_size: number | null;
  course_playlist_id: string | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

/** Studio row: everything except the storage path, plus sales. */
export interface ProductAdminRow extends ProductPublic {
  position: number;
  stock: number | null;
  sales_count: number;
  deleted_at: string | null;
}

/** Studio editor payload from the server (adds the object path so a replaced file can be cleaned up). */
export interface ProductAdminFull extends ProductAdminRow {
  file_path: string | null;
}

export interface PurchaseView {
  id: string;
  product: ProductCardData & { has_file: boolean; course_playlist_id: string | null };
  amount: number;
  method: PaymentMethod;
  paid_at: string;
}

export interface StudioPurchaseRow {
  id: string;
  product_id: string;
  product_title: string;
  user_id: string;
  user_name: string;
  user_email: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  status: "paid" | "refunded";
  paid_at: string;
}

// ───────── Formatting ─────────

/** ฿1,290 — and ฿1,290.50 when there are satang. Same thousands style as formatNumber() in format.ts. */
export function formatBaht(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "฿0";
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return `฿${v.toLocaleString("th-TH", whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 20 for ฿800 → ฿1,000; 0 when there is no (valid) compare-at price. */
export function discountPercent(price: number, compareAt: number | null | undefined): number {
  if (!compareAt || compareAt <= price) return 0;
  return Math.max(1, Math.round((1 - price / compareAt) * 100));
}

export function formatFileSize(bytes: number | null | undefined): string {
  const b = Number(bytes ?? 0);
  if (!b) return "";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Same-origin route helpers. */
export const productHref = (id: string) => `/shop/${id}`;
export const productCheckoutHref = (id: string) => `/shop/${id}/checkout`;

// ───────── "What you get" copy (from product_type) ─────────

export interface DeliveryInfo {
  /** One line for the product page's "สิ่งที่คุณจะได้รับ" list, most important first. */
  gets: string[];
  /** Short line for the order summary at checkout. */
  summary: string;
  /** Library button label. */
  libraryAction: string;
}

export function deliveryInfo(type: ProductType): DeliveryInfo {
  switch (type) {
    case "ebook":
      return {
        gets: ["ไฟล์ PDF ดาวน์โหลดได้ทันทีในคลังของคุณ", "ดาวน์โหลดซ้ำได้ไม่จำกัดครั้ง", "จ่ายครั้งเดียว ไม่มีค่าใช้จ่ายรายเดือน"],
        summary: "E-book เข้าคลังของคุณทันทีหลังชำระเงิน",
        libraryAction: "ดาวน์โหลด",
      };
    case "course":
      return {
        gets: ["เข้าเรียนได้ทันทีในคลังของคุณ", "ดูได้ตลอด ไม่มีวันหมดอายุ", "จ่ายครั้งเดียว ไม่ต้องเป็นสมาชิก"],
        summary: "คอร์สเข้าคลังของคุณทันทีหลังชำระเงิน และปลดล็อกทุกตอน",
        libraryAction: "เข้าเรียน",
      };
    case "template":
      return {
        gets: ["ไฟล์เทมเพลตดาวน์โหลดได้ทันทีในคลังของคุณ", "ดาวน์โหลดซ้ำได้ไม่จำกัดครั้ง", "จ่ายครั้งเดียว ไม่มีค่าใช้จ่ายรายเดือน"],
        summary: "เทมเพลตเข้าคลังของคุณทันทีหลังชำระเงิน",
        libraryAction: "ดาวน์โหลด",
      };
    default:
      return {
        gets: ["ไฟล์ดาวน์โหลดได้ทันทีในคลังของคุณ", "ดาวน์โหลดซ้ำได้ไม่จำกัดครั้ง", "จ่ายครั้งเดียว ไม่มีค่าใช้จ่ายรายเดือน"],
        summary: "สินค้าเข้าคลังของคุณทันทีหลังชำระเงิน",
        libraryAction: "ดาวน์โหลด",
      };
  }
}

/** Delivery / FAQ notes under the description. */
export const SHOP_FAQ: { q: string; a: string }[] = [
  { q: "ได้รับสินค้าเมื่อไหร่", a: "ทันทีที่ระบบยืนยันการชำระเงิน ปกติไม่ถึง 1 นาที สินค้าจะอยู่ที่ “คลังของฉัน” แท็บ “ที่ซื้อแล้ว”" },
  { q: "ต้องเป็นสมาชิกไหม", a: "ไม่ต้อง ซื้อแยกจากสมาชิกได้เลย จ่ายครั้งเดียว ไม่ต่ออายุอัตโนมัติ" },
  { q: "ชำระเงินแล้วแต่ยังไม่เห็นสินค้า", a: "รอสักครู่แล้วรีเฟรชหน้าคลัง ถ้ายังไม่ขึ้น ทักทีมงานทาง LINE OA พร้อมแนบสลิป เราจะรีบตรวจสอบให้" },
];

/** A same-origin path (blocks //evil.com and /\ tricks) — used for the checkout “return to” parameter. */
export function isSafePath(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") && v.length < 500;
}
