import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { adminDb } from "@/lib/supabase/clients";
import { HttpError } from "./auth";
import { audit } from "./mutations";
import { isMissingRelation, isUuid } from "./queries";
import {
  PRODUCT_LIMITS,
  isProductType,
  type ProductAdminFull,
  type ProductAdminRow,
  type ProductCardData,
  type ProductPublic,
  type ProductType,
  type PurchaseView,
  type StudioPurchaseRow,
} from "@/lib/shop";
import type { PaymentMethod, Viewer } from "@/lib/types";

/**
 * Shop data access. Products are read with the service role and an EXPLICIT column list: `file_path` (the object in the
 * private `products` bucket) is never selected for public pages — see 0013_shop.sql, anon/authenticated have no grant.
 */

export const SHOP_TAG = "shop";
export const PRODUCT_BUCKET = "products";
/** Signed download links live for one minute — long enough to start the download, too short to share. */
export const DOWNLOAD_TTL = 60;

const CARD_COLS = "id, kind, product_type, title, subtitle, cover_url, price_thb, compare_at_thb, is_featured";
const PUBLIC_COLS = `${CARD_COLS}, description, images, status, file_name, file_size, course_playlist_id, created_at, updated_at`;
const ADMIN_COLS = `${PUBLIC_COLS}, position, stock, deleted_at`;

type CardRow = Omit<ProductCardData, "owned" | "price_thb" | "compare_at_thb"> & { price_thb: number | string; compare_at_thb: number | string | null };
type PublicRow = CardRow & Omit<ProductPublic, keyof ProductCardData | "has_file"> & { file_size: number | string | null };
type AdminRowDb = PublicRow & { position: number; stock: number | null; deleted_at: string | null };

const num = (v: number | string) => Number(v);

function card(r: CardRow): ProductCardData {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    cover_url: r.cover_url,
    kind: r.kind,
    product_type: r.product_type,
    price_thb: num(r.price_thb),
    compare_at_thb: r.compare_at_thb == null ? null : num(r.compare_at_thb),
    is_featured: r.is_featured,
  };
}

function full(r: PublicRow): ProductPublic {
  return {
    ...card(r),
    description: r.description ?? "",
    images: r.images ?? [],
    has_file: !!r.file_name,
    file_name: r.file_name,
    file_size: r.file_size == null ? null : num(r.file_size),
    course_playlist_id: r.course_playlist_id,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** Run a shop query; if migration 0013 has not been applied yet, behave as if the shop were empty instead of crashing pages. */
function tolerate<T>(res: { data: T | null; error: { code?: string; message: string } | null }, empty: T, what: string): T {
  if (res.error) {
    if (isMissingRelation(res.error)) return empty;
    throw new Error(`${what}: ${res.error.message}`);
  }
  return res.data ?? empty;
}

// ───────────────────────── Public catalogue ─────────────────────────
/** Every published product's card data, in shop order (featured first, then position, then newest). Cached for everyone. */
const loadCards = unstable_cache(
  async (): Promise<ProductCardData[]> => {
    const res = await adminDb()
      .from("products")
      .select(CARD_COLS)
      .eq("status", "published")
      .is("deleted_at", null)
      .order("is_featured", { ascending: false })
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    return tolerate(res as unknown as { data: CardRow[] | null; error: { code?: string; message: string } | null }, [], "products").map(card);
  },
  ["tg-shop-cards-v1"],
  { tags: [SHOP_TAG], revalidate: 30 },
);

/** Which of these products does the user already own? (all their paid purchases when `ids` is omitted) */
export async function ownedProductIds(userId: string | null | undefined, ids?: string[]): Promise<Set<string>> {
  if (!userId || !isUuid(userId)) return new Set();
  let q = adminDb().from("purchases").select("product_id").eq("user_id", userId).eq("status", "paid");
  if (ids) {
    const ok = ids.filter(isUuid);
    if (!ok.length) return new Set();
    q = q.in("product_id", ok);
  }
  const rows = tolerate(await q, [] as { product_id: string }[], "owned products");
  return new Set(rows.map((r) => r.product_id));
}

async function withOwned(items: ProductCardData[], userId: string | null | undefined): Promise<ProductCardData[]> {
  if (!userId || !items.length) return items;
  const owned = await ownedProductIds(userId, items.map((p) => p.id));
  return items.map((p) => ({ ...p, owned: owned.has(p.id) }));
}

/** Published products for the shop page. `userId` fills `owned` so cards can show “เป็นเจ้าของแล้ว”. */
export async function listProducts(opts: { type?: ProductType; limit?: number; userId?: string | null } = {}): Promise<ProductCardData[]> {
  let items = await loadCards();
  if (opts.type) items = items.filter((p) => p.product_type === opts.type);
  if (opts.limit) items = items.slice(0, opts.limit);
  return withOwned(items, opts.userId);
}

/**
 * Featured products (is_featured = true) for the home page row — same shape as the shop grid, so it renders with
 * `ProductCard variant="row"`. Returns [] when nothing is featured (hide the row) or when the shop is not set up yet.
 */
export async function featuredProducts(limit = 12, userId?: string | null): Promise<ProductCardData[]> {
  const items = (await loadCards()).filter((p) => p.is_featured).slice(0, Math.max(0, limit));
  return withOwned(items, userId);
}

/** One product for its page. Drafts are visible to admins only. */
export async function getProduct(id: string, viewer?: Pick<Viewer, "id" | "is_admin"> | null): Promise<ProductPublic | null> {
  if (!isUuid(id)) return null;
  const res = await adminDb().from("products").select(PUBLIC_COLS).eq("id", id).is("deleted_at", null).maybeSingle();
  const row = tolerate(res as unknown as { data: PublicRow | null; error: { code?: string; message: string } | null }, null, "product");
  if (!row) return null;
  if (row.status !== "published" && !viewer?.is_admin) return null;
  const p = full(row);
  if (viewer?.id) p.owned = (await ownedProductIds(viewer.id, [id])).has(id);
  return p;
}

export async function hasPurchased(userId: string | null | undefined, productId: string): Promise<boolean> {
  if (!userId || !isUuid(productId)) return false;
  return (await ownedProductIds(userId, [productId])).has(productId);
}

/** The signed-in user's paid purchases, newest first (including products that were unpublished later — they keep access). */
export async function myPurchases(userId: string): Promise<PurchaseView[]> {
  const res = await adminDb()
    .from("purchases")
    .select("id, product_id, amount, method, paid_at")
    .eq("user_id", userId)
    .eq("status", "paid")
    .order("paid_at", { ascending: false });
  const rows = tolerate(res as unknown as { data: { id: string; product_id: string; amount: number | string; method: PaymentMethod; paid_at: string }[] | null; error: { code?: string; message: string } | null }, [], "purchases");
  if (!rows.length) return [];
  const prods = await adminDb().from("products").select(`${CARD_COLS}, file_name, course_playlist_id`).in("id", rows.map((r) => r.product_id));
  const byId = new Map(
    tolerate(prods as unknown as { data: (CardRow & { file_name: string | null; course_playlist_id: string | null })[] | null; error: { code?: string; message: string } | null }, [], "purchased products").map((p) => [
      p.id,
      { ...card(p), owned: true, has_file: !!p.file_name, course_playlist_id: p.course_playlist_id },
    ]),
  );
  return rows
    .filter((r) => byId.has(r.product_id))
    .map((r) => ({ id: r.id, product: byId.get(r.product_id)!, amount: num(r.amount), method: r.method, paid_at: r.paid_at }));
}

/**
 * A 60-second signed URL for the product's file — only for someone who bought it (or an admin). Throws HttpError otherwise.
 * The route /api/shop/download/[productId] calls this after rate-limiting.
 */
export async function downloadUrlFor(viewer: Pick<Viewer, "id" | "is_admin">, productId: string): Promise<string> {
  if (!isUuid(productId)) throw new HttpError(404, "ไม่พบสินค้า");
  const { data, error } = await adminDb().from("products").select("file_path, file_name").eq("id", productId).maybeSingle();
  if (error) throw new Error(`download product: ${error.message}`);
  if (!data?.file_path || !data.file_name) throw new HttpError(404, "สินค้านี้ไม่มีไฟล์ให้ดาวน์โหลด");
  if (!viewer.is_admin && !(await hasPurchased(viewer.id, productId))) throw new HttpError(403, "ต้องซื้อสินค้านี้ก่อนจึงดาวน์โหลดได้");
  const signed = await adminDb().storage.from(PRODUCT_BUCKET).createSignedUrl(data.file_path, DOWNLOAD_TTL, { download: data.file_name });
  if (signed.error || !signed.data?.signedUrl) {
    console.error(`product sign: ${signed.error?.message ?? "no url"}`);
    throw new HttpError(404, "ไม่พบไฟล์ กรุณาติดต่อทีมงาน");
  }
  return signed.data.signedUrl;
}

// ───────────────────────── Studio ─────────────────────────
function refreshShop(id?: string) {
  revalidateTag(SHOP_TAG);
  revalidatePath("/shop");
  if (id) revalidatePath(`/shop/${id}`);
  revalidatePath("/studio/shop");
  revalidatePath("/", "layout");
}

async function salesByProduct(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const res = await adminDb().from("purchases").select("product_id").eq("status", "paid").order("created_at").order("id").range(from, from + 999);
    const rows = tolerate(res as unknown as { data: { product_id: string }[] | null; error: { code?: string; message: string } | null }, [], "sales");
    for (const r of rows) out.set(r.product_id, (out.get(r.product_id) ?? 0) + 1);
    if (rows.length < 1000) return out;
  }
}

export async function studioProducts(): Promise<ProductAdminRow[]> {
  const res = await adminDb().from("products").select(ADMIN_COLS).is("deleted_at", null).order("created_at", { ascending: false });
  const rows = tolerate(res as unknown as { data: AdminRowDb[] | null; error: { code?: string; message: string } | null }, [], "studio products");
  const sales = await salesByProduct();
  return rows.map((r) => ({ ...full(r), position: r.position, stock: r.stock, deleted_at: r.deleted_at, sales_count: sales.get(r.id) ?? 0 }));
}

export async function studioProduct(id: string): Promise<ProductAdminFull | null> {
  if (!isUuid(id)) return null;
  const res = await adminDb().from("products").select(`${ADMIN_COLS}, file_path`).eq("id", id).is("deleted_at", null).maybeSingle();
  const row = tolerate(res as unknown as { data: (AdminRowDb & { file_path: string | null }) | null; error: { code?: string; message: string } | null }, null, "studio product");
  if (!row) return null;
  const sales = await salesByProduct();
  return { ...full(row), position: row.position, stock: row.stock, deleted_at: row.deleted_at, sales_count: sales.get(id) ?? 0, file_path: row.file_path };
}

export interface ProductInput {
  /** Client-generated uuid, so a file can be uploaded under products/<id>/ before the first save. */
  id: string;
  title: string;
  subtitle: string;
  product_type: string;
  price_thb: number;
  compare_at_thb: number | null;
  description: string;
  cover_url: string | null;
  images: string[];
  status: "draft" | "published";
  is_featured: boolean;
  course_playlist_id: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
}

const money = (v: unknown) => Math.round(Number(v) * 100) / 100;
const HTTP_URL = /^https?:\/\/\S+$/i;

function cleanUrl(v: unknown, what: string): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (s.toLowerCase().startsWith("data:") || !HTTP_URL.test(s) || s.length > 2000) throw new HttpError(400, `ลิงก์${what}ไม่ถูกต้อง`);
  return s;
}

async function storageObjectSize(objectName: string): Promise<number> {
  const slash = objectName.lastIndexOf("/");
  const { data, error } = await adminDb().storage.from(PRODUCT_BUCKET).list(objectName.slice(0, slash), { search: objectName.slice(slash + 1), limit: 10 });
  if (error) throw new Error(`storage: ${error.message}`);
  const found = data?.find((o) => o.name === objectName.slice(slash + 1));
  return Number((found?.metadata as { size?: number } | null)?.size ?? 0);
}

async function removeProductObjects(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return;
  const { error } = await adminDb().storage.from(PRODUCT_BUCKET).remove(list);
  if (error) console.error(`product storage remove: ${error.message}`);
}

/** A fresh, unguessable object name under this product's folder (a re-upload never overwrites the live file). */
export function newProductObject(productId: string, fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return `${productId}/${randomUUID()}${/^[a-z0-9]{1,8}$/.test(ext) ? `.${ext}` : ""}`;
}

/** Create or update a product. Everything is re-validated here; the editor only suggests. */
export async function saveProduct(admin: Viewer, input: ProductInput): Promise<{ id: string }> {
  const id = String(input.id ?? "");
  if (!isUuid(id)) throw new HttpError(400, "รหัสสินค้าไม่ถูกต้อง");

  const title = String(input.title ?? "").trim();
  if (!title) throw new HttpError(400, "ใส่ชื่อสินค้าก่อน");
  if (title.length > PRODUCT_LIMITS.title) throw new HttpError(400, `ชื่อสินค้ายาวเกิน ${PRODUCT_LIMITS.title} ตัวอักษร`);
  const subtitle = String(input.subtitle ?? "").trim();
  if (subtitle.length > PRODUCT_LIMITS.subtitle) throw new HttpError(400, `คำโปรยยาวเกิน ${PRODUCT_LIMITS.subtitle} ตัวอักษร`);
  const description = String(input.description ?? "");
  if (description.length > PRODUCT_LIMITS.description) throw new HttpError(400, "รายละเอียดยาวเกินไป");
  if (!isProductType(input.product_type)) throw new HttpError(400, "ประเภทสินค้าไม่ถูกต้อง");
  const type = input.product_type;

  const price = money(input.price_thb);
  if (!Number.isFinite(price) || price <= 0 || price > PRODUCT_LIMITS.price) throw new HttpError(400, "ราคาต้องมากกว่า 0 บาท");
  const compareAt = input.compare_at_thb == null || String(input.compare_at_thb) === "" ? null : money(input.compare_at_thb);
  if (compareAt != null && (!Number.isFinite(compareAt) || compareAt <= price)) throw new HttpError(400, "ราคาก่อนลดต้องมากกว่าราคาขาย");

  const cover = cleanUrl(input.cover_url, "รูปปก");
  const images = (Array.isArray(input.images) ? input.images : []).map((u) => cleanUrl(u, "รูป")).filter((u): u is string => !!u);
  if (images.length > PRODUCT_LIMITS.images) throw new HttpError(400, `ใส่รูปได้ไม่เกิน ${PRODUCT_LIMITS.images} รูป`);

  let playlistId: string | null = null;
  if (type === "course" && input.course_playlist_id) {
    if (!isUuid(input.course_playlist_id)) throw new HttpError(400, "เลือก Playlist ของคอร์สอีกครั้ง");
    const { data } = await adminDb().from("playlists").select("id").eq("id", input.course_playlist_id).maybeSingle();
    if (!data) throw new HttpError(400, "ไม่พบ Playlist ที่เลือก");
    playlistId = data.id as string;
  }

  const db = adminDb();
  const existingRes = await db.from("products").select("id, file_path, status").eq("id", id).maybeSingle();
  if (existingRes.error) {
    if (isMissingRelation(existingRes.error)) throw new HttpError(503, "ยังไม่ได้เปิดใช้ระบบร้านค้า (ต้องรัน migration 0013_shop ก่อน)");
    throw new Error(`product lookup: ${existingRes.error.message}`);
  }
  const existing = existingRes.data as { id: string; file_path: string | null; status: string } | null;

  // File: must live in this product's folder and really exist in the private bucket.
  let filePath = input.file_path ? String(input.file_path) : null;
  let fileName = input.file_name ? String(input.file_name).trim().slice(0, 255) : null;
  let fileSize: number | null = null;
  if (filePath) {
    if (!filePath.startsWith(`${id}/`) || filePath.includes("..") || filePath.length > 300) throw new HttpError(400, "ไฟล์สินค้าไม่ถูกต้อง");
    if (!fileName) fileName = filePath.split("/").pop() ?? "file";
    if (filePath !== existing?.file_path) {
      const size = await storageObjectSize(filePath);
      if (!size) throw new HttpError(409, "ไม่พบไฟล์ใน Storage กรุณาอัปโหลดไฟล์ใหม่");
      fileSize = size;
    } else {
      fileSize = input.file_size == null ? null : Math.max(0, Math.round(Number(input.file_size)) || 0);
    }
  } else {
    fileName = null;
  }

  const status = input.status === "published" ? "published" : "draft";
  if (status === "published") {
    if (type === "course" && !playlistId) throw new HttpError(400, "เลือก Playlist ของคอร์สก่อนเผยแพร่");
    if (type !== "course" && !filePath) throw new HttpError(400, "อัปโหลดไฟล์สินค้าก่อนเผยแพร่");
  }

  const now = new Date().toISOString();
  const row = {
    kind: "digital" as const,
    product_type: type,
    title,
    subtitle: subtitle || null,
    description,
    cover_url: cover,
    images,
    price_thb: price,
    compare_at_thb: compareAt,
    status,
    is_featured: status === "published" && !!input.is_featured,
    course_playlist_id: playlistId,
    file_path: filePath,
    file_name: fileName,
    file_size: fileSize,
    updated_at: now,
  };
  if (existing) {
    const { error } = await db.from("products").update(row).eq("id", id);
    if (error) throw new Error(`update product: ${error.message}`);
    if (existing.file_path && existing.file_path !== filePath) await removeProductObjects([existing.file_path]);
  } else {
    const { error } = await db.from("products").insert({ id, ...row });
    if (error) throw new Error(`create product: ${error.message}`);
  }
  await audit(admin.id, existing ? "product.update" : "product.create", "product", id, title);
  refreshShop(id);
  return { id };
}

/** Soft delete: the page disappears, buyers keep their access (their purchases still point at the row). */
export async function deleteProduct(admin: Viewer, id: string) {
  if (!isUuid(id)) throw new HttpError(404, "ไม่พบสินค้า");
  const { error } = await adminDb().from("products").update({ deleted_at: new Date().toISOString(), is_featured: false, status: "draft" }).eq("id", id);
  if (error) throw new Error(`delete product: ${error.message}`);
  await audit(admin.id, "product.delete", "product", id);
  refreshShop(id);
}

export async function setProductFeatured(admin: Viewer, id: string, featured: boolean) {
  if (!isUuid(id)) throw new HttpError(404, "ไม่พบสินค้า");
  const { data } = await adminDb().from("products").select("status").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) throw new HttpError(404, "ไม่พบสินค้า");
  if (featured && data.status !== "published") throw new HttpError(400, "ต้องเผยแพร่สินค้าก่อนจึงจะแนะนำที่หน้าแรกได้");
  const { error } = await adminDb().from("products").update({ is_featured: featured, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`feature product: ${error.message}`);
  await audit(admin.id, featured ? "product.feature" : "product.unfeature", "product", id);
  refreshShop(id);
}

/** Give a customer a product by email — no payment. Recorded as a purchase with method 'manual' and amount 0. */
export async function grantProduct(admin: Viewer, productId: string, email: string): Promise<{ user_id: string; name: string }> {
  if (!isUuid(productId)) throw new HttpError(404, "ไม่พบสินค้า");
  const mail = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new HttpError(400, "อีเมลไม่ถูกต้อง");
  const db = adminDb();
  const { data: uid, error: uerr } = await db.rpc("user_id_by_email", { p_email: mail });
  if (uerr) throw new Error(`user lookup: ${uerr.message}`);
  if (!uid) throw new HttpError(404, "ไม่พบผู้ใช้อีเมลนี้ ให้ลูกค้าสมัครสมาชิกเว็บก่อน");
  const userId = uid as string;
  const { data: prod } = await db.from("products").select("id, title").eq("id", productId).is("deleted_at", null).maybeSingle();
  if (!prod) throw new HttpError(404, "ไม่พบสินค้า");
  if (await hasPurchased(userId, productId)) throw new HttpError(409, "ลูกค้าคนนี้มีสินค้านี้อยู่แล้ว");
  const { error } = await db.rpc("apply_purchase", {
    p_user_id: userId,
    p_product_id: productId,
    p_amount: 0,
    p_currency: "THB",
    p_method: "manual",
    p_reference: `MANUAL-${randomUUID()}`,
    p_paid_at: new Date().toISOString(),
    p_raw: { granted_by: admin.id, email: mail },
    p_manual: true,
  });
  if (error) throw new Error(`apply_purchase: ${error.message}`);
  const { data: prof } = await db.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  await audit(admin.id, "product.grant", "user", userId, `${prod.title as string} · ${mail}`);
  revalidatePath("/studio/shop");
  return { user_id: userId, name: (prof?.display_name as string) || mail };
}

/** Take a purchase back (refund): the buyer loses the download / course unlock. The money side is handled in the payment gateway. */
export async function refundPurchase(admin: Viewer, purchaseId: string) {
  if (!isUuid(purchaseId)) throw new HttpError(404, "ไม่พบรายการ");
  const { error } = await adminDb().from("purchases").update({ status: "refunded" }).eq("id", purchaseId);
  if (error) throw new Error(`refund purchase: ${error.message}`);
  await audit(admin.id, "purchase.refund", "purchase", purchaseId);
  revalidatePath("/studio/shop");
}

export async function studioPurchases(limit = 60, productId?: string): Promise<StudioPurchaseRow[]> {
  let q = adminDb().from("purchases").select("id, product_id, user_id, amount, method, reference, status, paid_at").order("paid_at", { ascending: false }).limit(limit);
  if (productId && isUuid(productId)) q = q.eq("product_id", productId);
  const rows = tolerate(await q, [] as { id: string; product_id: string; user_id: string; amount: number | string; method: PaymentMethod; reference: string; status: "paid" | "refunded"; paid_at: string }[], "studio purchases");
  if (!rows.length) return [];
  const db = adminDb();
  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const [prods, profs, emails] = await Promise.all([
    db.from("products").select("id, title").in("id", productIds),
    db.from("profiles").select("id, display_name").in("id", userIds),
    Promise.all(userIds.map(async (uid) => [uid, (await db.auth.admin.getUserById(uid)).data.user?.email ?? ""] as const)),
  ]);
  const title = new Map((prods.data ?? []).map((p) => [p.id as string, p.title as string]));
  const name = new Map((profs.data ?? []).map((p) => [p.id as string, (p.display_name as string) || ""]));
  const email = new Map(emails);
  return rows.map((r) => ({
    id: r.id,
    product_id: r.product_id,
    product_title: title.get(r.product_id) ?? "(สินค้าที่ถูกลบ)",
    user_id: r.user_id,
    user_name: name.get(r.user_id) || (email.get(r.user_id) ?? "").split("@")[0] || "ผู้ใช้",
    user_email: email.get(r.user_id) ?? "",
    amount: num(r.amount),
    method: r.method,
    reference: r.reference,
    status: r.status,
    paid_at: r.paid_at,
  }));
}

/** Published products for the sitemap (id + last change). */
export async function shopSitemap(): Promise<{ id: string; updated_at: string }[]> {
  try {
    const res = await adminDb().from("products").select("id, updated_at").eq("status", "published").is("deleted_at", null);
    return tolerate(res as unknown as { data: { id: string; updated_at: string }[] | null; error: { code?: string; message: string } | null }, [], "shop sitemap");
  } catch (e) {
    console.error(e);
    return [];
  }
}
