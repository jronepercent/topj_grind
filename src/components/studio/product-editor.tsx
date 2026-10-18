"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, FileUp, ImagePlus, Loader2, Package, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Markdown } from "@/components/community/markdown";
import { uploadProductFile, type ProductUpload } from "./product-file-upload";
import { PurchasesList } from "./purchases-list";
import { createProductFileTicketAction, grantProductAction, saveProductAction, signProductImageAction } from "@/app/studio/shop/actions";
import { ACCEPT_IMAGES, prepareImage, putImage } from "@/lib/client/images";
import { formatNumber } from "@/lib/format";
import {
  PRODUCT_LIMITS,
  PRODUCT_TYPES,
  PRODUCT_TYPE_LABEL,
  discountPercent,
  formatBaht,
  formatFileSize,
  type ProductAdminFull,
  type ProductType,
  type StudioPurchaseRow,
} from "@/lib/shop";
import { cn } from "@/lib/utils";

export interface PlaylistOption {
  id: string;
  title: string;
  is_course: boolean;
}

/** Pick → resize → straight to Storage via a signed URL → public URL. */
async function uploadProductImage(file: File): Promise<string> {
  const img = await prepareImage(file);
  const signed = await signProductImageAction(img.contentType);
  if (!signed.ok) throw new Error(signed.error);
  await putImage(signed.data.uploadUrl, img);
  return signed.data.publicUrl;
}

const toNumber = (s: string) => Number(s.replace(/,/g, "").trim());

interface FileState {
  path: string;
  name: string;
  size: number | null;
}

export function ProductEditor({ initial, playlists, purchases }: { initial?: ProductAdminFull; playlists: PlaylistOption[]; purchases: StudioPurchaseRow[] }) {
  const router = useRouter();
  // The id exists before the first save so the file can be uploaded under products/<id>/ right away.
  const [id] = React.useState(() => initial?.id ?? crypto.randomUUID());
  const [saved, setSaved] = React.useState(!!initial);
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [subtitle, setSubtitle] = React.useState(initial?.subtitle ?? "");
  const [type, setType] = React.useState<ProductType>(initial?.product_type ?? "ebook");
  const [price, setPrice] = React.useState(initial ? String(initial.price_thb) : "");
  const [compareAt, setCompareAt] = React.useState(initial?.compare_at_thb ? String(initial.compare_at_thb) : "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [cover, setCover] = React.useState<string | null>(initial?.cover_url ?? null);
  const [images, setImages] = React.useState<string[]>(initial?.images ?? []);
  const [status, setStatus] = React.useState<"draft" | "published">(initial?.status ?? "draft");
  const [featured, setFeatured] = React.useState(initial?.is_featured ?? false);
  const [playlistId, setPlaylistId] = React.useState(initial?.course_playlist_id ?? "");
  const [file, setFile] = React.useState<FileState | null>(
    initial?.file_path && initial.file_name ? { path: initial.file_path, name: initial.file_name, size: initial.file_size } : null,
  );
  const [fileJob, setFileJob] = React.useState<{ name: string; progress: number } | null>(null);
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const [saving, setSaving] = React.useState<null | "draft" | "published">(null);
  const [imgBusy, setImgBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const coverInput = React.useRef<HTMLInputElement>(null);
  const galleryInput = React.useRef<HTMLInputElement>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const job = React.useRef<ProductUpload | null>(null);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  React.useEffect(() => {
    if (!dirty && !fileJob) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, fileJob]);
  React.useEffect(() => () => job.current?.abort(), []);

  const priceNum = toNumber(price);
  const compareNum = compareAt.trim() ? toNumber(compareAt) : null;
  const priceOk = Number.isFinite(priceNum) && priceNum > 0 && priceNum <= PRODUCT_LIMITS.price;
  const compareOk = compareNum == null || (Number.isFinite(compareNum) && priceOk && compareNum > priceNum);
  const titleOk = title.trim().length > 0 && title.length <= PRODUCT_LIMITS.title;
  const descOk = description.length <= PRODUCT_LIMITS.description;
  const off = priceOk && compareNum && compareOk ? discountPercent(priceNum, compareNum) : 0;
  const uploading = !!fileJob || imgBusy;

  const save = async (next: "draft" | "published") => {
    if (!titleOk) return toast("ใส่ชื่อสินค้าก่อน");
    if (!priceOk) return toast("ใส่ราคาที่มากกว่า 0 บาท");
    if (!compareOk) return toast("ราคาก่อนลดต้องมากกว่าราคาขาย");
    if (!descOk) return toast("รายละเอียดยาวเกินไป");
    if (next === "published") {
      if (type === "course" && !playlistId) return toast("เลือก Playlist ของคอร์สก่อนเผยแพร่");
      if (type !== "course" && !file) return toast("อัปโหลดไฟล์สินค้าก่อนเผยแพร่");
    }
    setSaving(next);
    const r = await saveProductAction({
      id,
      title,
      subtitle,
      product_type: type,
      price_thb: priceNum,
      compare_at_thb: compareNum,
      description,
      cover_url: cover,
      images,
      status: next,
      is_featured: next === "published" && featured,
      course_playlist_id: type === "course" && playlistId ? playlistId : null,
      file_path: file?.path ?? null,
      file_name: file?.name ?? null,
      file_size: file?.size ?? null,
    });
    setSaving(null);
    if (!r.ok) return toast(r.error);
    setStatus(next);
    if (next !== "published") setFeatured(false);
    setDirty(false);
    toast(next === "published" ? "เผยแพร่แล้ว" : "บันทึกฉบับร่างแล้ว");
    if (!saved) {
      setSaved(true);
      router.replace(`/studio/shop/${id}/edit`);
    } else router.refresh();
  };

  // ── Images ──
  const pickCover = async (f: File | undefined) => {
    if (!f) return;
    setImgBusy(true);
    try {
      touch(setCover)(await uploadProductImage(f));
    } catch (e) {
      toast(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setImgBusy(false);
    }
  };
  const addGallery = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = PRODUCT_LIMITS.images - images.length;
    if (room <= 0) return toast(`ใส่รูปได้ไม่เกิน ${PRODUCT_LIMITS.images} รูป`);
    setImgBusy(true);
    const added: string[] = [];
    try {
      for (const f of Array.from(files).slice(0, room)) added.push(await uploadProductImage(f));
    } catch (e) {
      toast(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      if (added.length) touch(setImages)([...images, ...added]);
      setImgBusy(false);
    }
  };

  // ── File (private bucket, resumable upload with real progress) ──
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > PRODUCT_LIMITS.fileBytes) return toast("ไฟล์ใหญ่เกิน 2 GB");
    if (f.size === 0) return toast("ไฟล์นี้ว่างเปล่า");
    const ticket = await createProductFileTicketAction(id, f.name);
    if (!ticket.ok) return toast(ticket.error);
    setFileJob({ name: f.name, progress: 0 });
    const up = uploadProductFile(f, ticket.data, id, (p) => setFileJob({ name: f.name, progress: p }));
    job.current = up;
    try {
      const objectName = await up.done;
      touch(setFile)({ path: objectName, name: f.name, size: f.size });
      toast("อัปโหลดไฟล์เสร็จแล้ว กด “บันทึก” เพื่อใช้ไฟล์นี้");
    } catch (e) {
      toast(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      job.current = null;
      setFileJob(null);
    }
  };

  const isPublished = status === "published" && !!initial && initial.status === "published";
  const selectedPlaylist = playlists.find((p) => p.id === playlistId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/studio/shop">
            <ArrowLeft /> ร้านค้า
          </Link>
        </Button>
        <span className="t-meta">
          {saved ? (status === "published" ? "เผยแพร่แล้ว" : "ฉบับร่าง") : "สินค้าใหม่"}
          {dirty && " · ยังไม่ได้บันทึก"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {saved && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/shop/${id}`} target="_blank">
                ดูหน้าสินค้า <ExternalLink />
              </Link>
            </Button>
          )}
          <Button variant="secondary" onClick={() => save("draft")} disabled={!!saving || uploading}>
            {saving === "draft" && <Loader2 className="animate-spin" />}
            {isPublished ? "เปลี่ยนเป็นฉบับร่าง" : "บันทึกฉบับร่าง"}
          </Button>
          <Button variant="inverse" onClick={() => save("published")} disabled={!!saving || uploading}>
            {saving === "published" && <Loader2 className="animate-spin" />}
            {isPublished ? "บันทึกการแก้ไข" : "เผยแพร่"}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Field label="ชื่อสินค้า (จำเป็น)" counter={`${title.length}/${PRODUCT_LIMITS.title}`}>
            <input
              value={title}
              onChange={(e) => touch(setTitle)(e.target.value)}
              maxLength={PRODUCT_LIMITS.title + 20}
              placeholder="ชื่อที่บอกว่าซื้อแล้วจะได้อะไร"
              className={cn(inputClass, "text-[18px] font-semibold", title.length > PRODUCT_LIMITS.title && "border-danger/60")}
            />
          </Field>
          <Field label="คำโปรย" counter={`${subtitle.length}/${PRODUCT_LIMITS.subtitle}`} hint="บรรทัดเดียวใต้ชื่อในหน้าสินค้าและการ์ด">
            <input value={subtitle} onChange={(e) => touch(setSubtitle)(e.target.value.slice(0, PRODUCT_LIMITS.subtitle))} className={inputClass} />
          </Field>

          {/* ───── File / course ───── */}
          <section className="rounded-[16px] border border-border bg-surface p-5">
            <h3 className="text-[15px] font-semibold">{type === "course" ? "คอร์สเรียน" : "ไฟล์สินค้า"}</h3>
            {type === "course" && (
              <div className="mt-3">
                <Field label="Playlist ของคอร์ส" hint="ผู้ซื้อดูทุกตอนใน Playlist นี้ได้ แม้ตอนที่ตั้งเป็น “เฉพาะสมาชิก” โดยไม่ต้องเป็นสมาชิก">
                  <select value={playlistId} onChange={(e) => touch(setPlaylistId)(e.target.value)} className={inputClass}>
                    <option value="">— เลือก Playlist —</option>
                    {playlists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                        {p.is_course ? " (ซีรีส์บทเรียน)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                {selectedPlaylist && (
                  <Link href={`/playlists/${selectedPlaylist.id}`} target="_blank" className="t-meta mt-2 inline-flex items-center gap-1 underline underline-offset-2">
                    ดู Playlist <ExternalLink className="size-3" />
                  </Link>
                )}
              </div>
            )}

            <input
              ref={fileInput}
              type="file"
              hidden
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className={cn(type === "course" && "mt-5 border-t border-border pt-4")}>
              {type === "course" && <p className="mb-2 text-[13px] font-medium">ไฟล์ประกอบคอร์ส (ไม่บังคับ)</p>}
              {fileJob ? (
                <div role="status" aria-live="polite">
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate font-medium">{fileJob.name}</span>
                    <span className="tnum shrink-0 text-text-2">{Math.round(fileJob.progress * 100)}%</span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-hover"
                    role="progressbar"
                    aria-label="ความคืบหน้าการอัปโหลด"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(fileJob.progress * 100)}
                  >
                    <div className="h-full rounded-full bg-text transition-[width] duration-200" style={{ width: `${fileJob.progress * 100}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="t-caption text-text-2">อย่าปิดหน้านี้จนกว่าจะเสร็จ ถ้าเน็ตหลุดเลือกไฟล์เดิมซ้ำเพื่ออัปโหลดต่อ</p>
                    <Button size="sm" variant="ghost" onClick={() => job.current?.abort()}>
                      <X /> ยกเลิก
                    </Button>
                  </div>
                </div>
              ) : file ? (
                <div className="flex items-center gap-3 rounded-[12px] border border-border bg-bg px-4 py-3">
                  <Package className="size-5 shrink-0 text-text-2" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{file.name}</p>
                    <p className="t-meta">{file.size ? formatFileSize(file.size) : "อัปโหลดแล้ว"}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
                    เปลี่ยนไฟล์
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="เอาไฟล์ออก" onClick={() => touch(setFile)(null)}>
                    <Trash2 />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border-strong px-4 py-8 text-[14px] text-text-2 transition-colors hover:bg-hover hover:text-text"
                >
                  <FileUp className="size-6" strokeWidth={1.5} aria-hidden />
                  <span className="font-medium">เลือกไฟล์ (PDF, ZIP, เทมเพลต …)</span>
                  <span className="t-caption">ใหญ่ได้ถึง 2 GB · เก็บเป็นส่วนตัว ดาวน์โหลดได้เฉพาะคนที่ซื้อ</span>
                </button>
              )}
              {file && file.path !== initial?.file_path && !fileJob && <p className="t-caption mt-2 text-member">ไฟล์ใหม่ยังไม่ได้บันทึก กด “บันทึก” ด้านบนเพื่อใช้ไฟล์นี้</p>}
            </div>
          </section>

          {/* ───── Description ───── */}
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-border p-1" role="tablist" aria-label="โหมดรายละเอียด">
                {(
                  [
                    ["edit", "เขียน"],
                    ["preview", "พรีวิว"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={mode === k}
                    onClick={() => setMode(k)}
                    className={cn("rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors", mode === k ? "bg-text text-bg" : "text-text-2 hover:text-text")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className={cn("t-caption tnum ml-auto", !descOk ? "text-danger" : "text-text-2")}>
                {formatNumber(description.length)}/{formatNumber(PRODUCT_LIMITS.description)}
              </span>
            </div>
            {mode === "edit" ? (
              <textarea
                value={description}
                onChange={(e) => touch(setDescription)(e.target.value)}
                rows={18}
                spellCheck={false}
                placeholder={"เขียนด้วย Markdown\n\n## ในเล่มนี้มีอะไร\n- บทที่ 1 …\n- บทที่ 2 …\n\n## เหมาะกับใคร"}
                className={cn(inputClass, "min-h-[360px] resize-y font-mono text-[14px] leading-[24px]", !descOk && "border-danger/60")}
                aria-label="รายละเอียดสินค้า (Markdown)"
              />
            ) : (
              <div className="min-h-[360px] rounded-[12px] border border-border bg-bg px-5 py-6 sm:px-8">
                <div className="max-w-[680px] text-[16px] leading-[1.8]">
                  {description.trim() ? <Markdown>{description}</Markdown> : <p className="text-text-2">ยังไม่มีรายละเอียด</p>}
                </div>
              </div>
            )}
          </div>

          {/* ───── Gallery ───── */}
          <section className="rounded-[16px] border border-border bg-surface p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-semibold">รูปสินค้าเพิ่มเติม</h3>
              <span className="t-caption tnum text-text-2">
                {images.length}/{PRODUCT_LIMITS.images}
              </span>
            </div>
            <p className="t-meta mt-1">แสดงต่อจากรูปปกในหน้าสินค้า ปัดดูได้บนมือถือ</p>
            <input
              ref={galleryInput}
              type="file"
              accept={ACCEPT_IMAGES}
              multiple
              hidden
              onChange={(e) => {
                void addGallery(e.target.files);
                e.target.value = "";
              }}
            />
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {images.map((src, i) => (
                <li key={src} className="relative aspect-[4/5] overflow-hidden rounded-[10px] border border-border bg-elevated">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`รูปที่ ${i + 1}`} className="absolute inset-0 size-full object-cover" loading="lazy" />
                  <button
                    type="button"
                    onClick={() => touch(setImages)(images.filter((x) => x !== src))}
                    className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                    aria-label={`เอารูปที่ ${i + 1} ออก`}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
              {images.length < PRODUCT_LIMITS.images && (
                <li>
                  <button
                    type="button"
                    onClick={() => galleryInput.current?.click()}
                    disabled={imgBusy}
                    className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border-strong text-[12px] text-text-2 transition-colors hover:bg-hover hover:text-text disabled:opacity-50"
                  >
                    {imgBusy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                    เพิ่มรูป
                  </button>
                </li>
              )}
            </ul>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-[16px] border border-border bg-surface p-5">
            <p className="mb-2 text-[13px] font-medium">ชนิดสินค้า</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ชนิดสินค้า">
              <button type="button" role="radio" aria-checked className="rounded-[10px] border border-text bg-hover px-3 py-2.5 text-[13px] font-medium">
                ดิจิทัล
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={false}
                aria-disabled
                disabled
                className="flex flex-col items-center rounded-[10px] border border-border px-3 py-1.5 text-[13px] font-medium text-text-2 opacity-70"
              >
                สินค้าจริง
                <span className="text-[11px] font-normal">เร็วๆ นี้</span>
              </button>
            </div>
            <div className="mt-4">
              <Field label="ประเภท">
                <select value={type} onChange={(e) => touch(setType)(e.target.value as ProductType)} className={inputClass}>
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PRODUCT_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-[16px] border border-border bg-surface p-5">
            <Field label="ราคาขาย (บาท)" hint={priceOk ? `ลูกค้าเห็น ${formatBaht(priceNum)}` : undefined}>
              <input
                value={price}
                onChange={(e) => touch(setPrice)(e.target.value)}
                inputMode="decimal"
                placeholder="990"
                className={cn(inputClass, "tnum", price && !priceOk && "border-danger/60")}
              />
            </Field>
            <div className="mt-4">
              <Field label="ราคาก่อนลด (ไม่บังคับ)" hint={off > 0 ? `แสดงเป็นราคาขีดฆ่า ลด ${off}%` : "ต้องมากกว่าราคาขาย"}>
                <input
                  value={compareAt}
                  onChange={(e) => touch(setCompareAt)(e.target.value)}
                  inputMode="decimal"
                  placeholder="1290"
                  className={cn(inputClass, "tnum", compareAt && !compareOk && "border-danger/60")}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-[16px] border border-border bg-surface p-5">
            <h3 className="text-[15px] font-semibold">รูปปก</h3>
            <input
              ref={coverInput}
              type="file"
              accept={ACCEPT_IMAGES}
              hidden
              onChange={(e) => {
                void pickCover(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="relative mx-auto mt-3 aspect-[4/5] w-full max-w-[220px] overflow-hidden rounded-[12px] border border-dashed border-border bg-elevated">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <button type="button" onClick={() => coverInput.current?.click()} disabled={imgBusy} className="flex size-full flex-col items-center justify-center gap-1 text-[13px] text-text-2 hover:text-text">
                  {imgBusy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                  อัปโหลดรูปปก 4:5
                </button>
              )}
              {cover && imgBusy && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="size-5 animate-spin text-white" />
                </span>
              )}
            </div>
            {cover && (
              <div className="mt-2 flex justify-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => coverInput.current?.click()} disabled={imgBusy}>
                  เปลี่ยนรูป
                </Button>
                <Button variant="ghost" size="sm" onClick={() => touch(setCover)(null)} disabled={imgBusy}>
                  <X /> เอาออก
                </Button>
              </div>
            )}
          </section>

          <section className="rounded-[16px] border border-border bg-surface p-5">
            <p className="mb-2 text-[13px] font-medium">การเผยแพร่</p>
            <p className="text-[14px]">
              สถานะตอนนี้: <b>{status === "published" ? "เผยแพร่แล้ว" : "ฉบับร่าง"}</b>
            </p>
            <p className="t-caption mt-1 text-text-2">ใช้ปุ่มด้านบนเพื่อเผยแพร่หรือเก็บเป็นฉบับร่าง สินค้าที่เป็นฉบับร่างลูกค้าจะไม่เห็น</p>
            <label className="mt-4 flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block text-[14px] font-medium">แนะนำที่หน้าแรก</span>
                <span className="t-caption block text-text-2">แสดงในแถวสินค้าแนะนำ (ต้องเผยแพร่)</span>
              </span>
              <Switch checked={featured} onCheckedChange={touch(setFeatured)} aria-label="แนะนำที่หน้าแรก" />
            </label>
          </section>
        </aside>
      </div>

      {saved && (
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-labelledby="orders-h" className="min-w-0">
            <h2 id="orders-h" className="t-h2 mb-3">
              ผู้ซื้อสินค้านี้
            </h2>
            <PurchasesList rows={purchases} showProduct={false} empty="ยังไม่มีผู้ซื้อ" />
          </section>
          <GrantBox productId={id} onDone={() => router.refresh()} />
        </div>
      )}
    </div>
  );
}

/** “ให้สิทธิ์ลูกค้า”: record a manual purchase (method manual, amount 0) for a customer's email — no payment involved. */
function GrantBox({ productId, onDone }: { productId: string; onDone: () => void }) {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    const r = await grantProductAction(productId, email.trim());
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast(`ให้สิทธิ์ ${r.data.name} แล้ว`);
    setEmail("");
    onDone();
  };
  return (
    <form onSubmit={submit} className="h-fit rounded-[16px] border border-border bg-surface p-5" aria-labelledby="grant-h">
      <h3 id="grant-h" className="text-[15px] font-semibold">
        ให้สิทธิ์ลูกค้า
      </h3>
      <p className="t-meta mt-1">ใช้เมื่อลูกค้าโอนเงินเอง หรือแจกฟรี ระบบจะบันทึกเป็นการซื้อแบบ “เพิ่มโดยผู้ดูแล” และแจ้งเตือนลูกค้า</p>
      <div className="mt-4">
        <Field label="อีเมลลูกค้า (ที่สมัครเว็บแล้ว)">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" className={inputClass} />
        </Field>
      </div>
      <Button type="submit" variant="inverse" className="mt-3 w-full" disabled={busy || !email.trim()}>
        {busy && <Loader2 className="animate-spin" />} ให้สิทธิ์
      </Button>
    </form>
  );
}
