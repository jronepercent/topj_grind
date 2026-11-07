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
import { createFreebieFileTicketAction, saveFreebieAction, signFreebieImageAction } from "@/app/studio/free/actions";
import { ACCEPT_IMAGES, prepareImage, putImage } from "@/lib/client/images";
import { formatNumber, thaiDateTime } from "@/lib/format";
import { formatFileSize } from "@/lib/shop";
import { FREEBIE_LIMITS, isFreebieUrl, type FreebieAdminFull, type FreebieClaimRow, type FreebieKind } from "@/lib/freebies";
import { cn } from "@/lib/utils";

async function uploadCover(file: File): Promise<string> {
  const img = await prepareImage(file);
  const signed = await signFreebieImageAction(img.contentType);
  if (!signed.ok) throw new Error(signed.error);
  await putImage(signed.data.uploadUrl, img);
  return signed.data.publicUrl;
}

interface FileState {
  path: string;
  name: string;
  size: number | null;
}

export function FreebieEditor({ initial, claims }: { initial?: FreebieAdminFull; claims: FreebieClaimRow[] }) {
  const router = useRouter();
  // The id exists before the first save so the file can be uploaded under free/<id>/ right away.
  const [id] = React.useState(() => initial?.id ?? crypto.randomUUID());
  const [saved, setSaved] = React.useState(!!initial);
  const [kind, setKind] = React.useState<FreebieKind>(initial?.kind ?? "file");
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [subtitle, setSubtitle] = React.useState(initial?.subtitle ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [cover, setCover] = React.useState<string | null>(initial?.cover_url ?? null);
  const [url, setUrl] = React.useState(initial?.url ?? "");
  const [status, setStatus] = React.useState<"draft" | "published">(initial?.status ?? "draft");
  const [featured, setFeatured] = React.useState(initial?.is_featured ?? false);
  const [file, setFile] = React.useState<FileState | null>(
    initial?.file_path && initial.file_name ? { path: initial.file_path, name: initial.file_name, size: initial.file_size } : null,
  );
  const [fileJob, setFileJob] = React.useState<{ name: string; progress: number } | null>(null);
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const [saving, setSaving] = React.useState<null | "draft" | "published">(null);
  const [imgBusy, setImgBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const coverInput = React.useRef<HTMLInputElement>(null);
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

  const titleOk = title.trim().length > 0 && title.length <= FREEBIE_LIMITS.title;
  const descOk = description.length <= FREEBIE_LIMITS.description;
  const urlTrim = url.trim();
  const urlOk = !urlTrim || isFreebieUrl(urlTrim);
  const uploading = !!fileJob || imgBusy;

  const save = async (next: "draft" | "published") => {
    if (!titleOk) return toast("ใส่ชื่อก่อน");
    if (!descOk) return toast("รายละเอียดยาวเกินไป");
    if (kind === "tool" && !urlOk) return toast("ลิงก์ต้องขึ้นต้นด้วย https:// หรือ / (หน้าในเว็บนี้)");
    if (next === "published") {
      if (kind === "file" && !file) return toast("อัปโหลดไฟล์ก่อนเผยแพร่");
      if (kind === "tool" && !urlTrim) return toast("ใส่ลิงก์เครื่องมือก่อนเผยแพร่");
    }
    setSaving(next);
    const r = await saveFreebieAction({
      id,
      kind,
      title,
      subtitle,
      description,
      cover_url: cover,
      file_path: kind === "file" ? (file?.path ?? null) : null,
      file_name: kind === "file" ? (file?.name ?? null) : null,
      file_size: kind === "file" ? (file?.size ?? null) : null,
      url: kind === "tool" ? urlTrim : "",
      status: next,
      is_featured: next === "published" && featured,
    });
    setSaving(null);
    if (!r.ok) return toast(r.error);
    setStatus(next);
    if (next !== "published") setFeatured(false);
    setDirty(false);
    toast(next === "published" ? "เผยแพร่แล้ว" : "บันทึกฉบับร่างแล้ว");
    if (!saved) {
      setSaved(true);
      router.replace(`/studio/free/${id}/edit`);
    } else router.refresh();
  };

  const pickCover = async (f: File | undefined) => {
    if (!f) return;
    setImgBusy(true);
    try {
      touch(setCover)(await uploadCover(f));
    } catch (e) {
      toast(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setImgBusy(false);
    }
  };

  // File → private `products` bucket under free/<id>/, resumable upload with real progress (same as shop files).
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > FREEBIE_LIMITS.fileBytes) return toast("ไฟล์ใหญ่เกิน 2 GB");
    if (f.size === 0) return toast("ไฟล์นี้ว่างเปล่า");
    const ticket = await createFreebieFileTicketAction(id, f.name);
    if (!ticket.ok) return toast(ticket.error);
    setFileJob({ name: f.name, progress: 0 });
    const up = uploadProductFile(f, ticket.data, `free/${id}/`, (p) => setFileJob({ name: f.name, progress: p }));
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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/studio/free">
            <ArrowLeft /> ของฟรี
          </Link>
        </Button>
        <span className="t-meta">
          {saved ? (status === "published" ? "เผยแพร่แล้ว" : "ฉบับร่าง") : "ของฟรีชิ้นใหม่"}
          {dirty && " · ยังไม่ได้บันทึก"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {saved && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/free/${id}`} target="_blank">
                ดูหน้านี้ <ExternalLink />
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
          <Field label="ชื่อ (จำเป็น)" counter={`${title.length}/${FREEBIE_LIMITS.title}`}>
            <input
              value={title}
              onChange={(e) => touch(setTitle)(e.target.value)}
              maxLength={FREEBIE_LIMITS.title + 20}
              placeholder="ชื่อที่บอกว่าโหลดไปแล้วได้อะไร"
              className={cn(inputClass, "text-[18px] font-semibold", title.length > FREEBIE_LIMITS.title && "border-danger/60")}
            />
          </Field>
          <Field label="คำโปรย" counter={`${subtitle.length}/${FREEBIE_LIMITS.subtitle}`} hint="บรรทัดเดียวใต้ชื่อในการ์ดและหน้ารายละเอียด">
            <input value={subtitle} onChange={(e) => touch(setSubtitle)(e.target.value.slice(0, FREEBIE_LIMITS.subtitle))} className={inputClass} />
          </Field>

          <section className="rounded-[16px] border border-border bg-surface p-5">
            <h3 className="text-[15px] font-semibold">{kind === "file" ? "ไฟล์ที่แจก" : "ลิงก์เครื่องมือ"}</h3>
            {kind === "file" ? (
              <div className="mt-3">
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  onChange={(e) => {
                    void pickFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
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
                    <span className="t-caption">ใหญ่ได้ถึง 2 GB · เก็บเป็นส่วนตัว โหลดได้เฉพาะคนที่สมัครบัญชีแล้ว</span>
                  </button>
                )}
                {file && file.path !== initial?.file_path && !fileJob && <p className="t-caption mt-2 text-member">ไฟล์ใหม่ยังไม่ได้บันทึก กด “บันทึก” ด้านบนเพื่อใช้ไฟล์นี้</p>}
              </div>
            ) : (
              <div className="mt-3">
                <Field
                  label="ลิงก์"
                  hint={!urlOk ? "ต้องขึ้นต้นด้วย https:// หรือ / (หน้าในเว็บนี้ เช่น /tools/price)" : "เว็บนอก (https://…) เปิดในแท็บใหม่ · หน้าในเว็บนี้ขึ้นต้นด้วย /"}
                >
                  <input
                    value={url}
                    onChange={(e) => touch(setUrl)(e.target.value)}
                    maxLength={FREEBIE_LIMITS.url}
                    placeholder="https://… หรือ /tools/…"
                    inputMode="url"
                    className={cn(inputClass, !urlOk && "border-danger/60")}
                  />
                </Field>
                <p className="t-caption mt-2 text-text-2">คนกดต้องล็อกอินก่อน ระบบบันทึกว่าใครเปิด แล้วค่อยส่งไปที่ลิงก์นี้ (ลิงก์จริงยังเห็นได้ ถ้าเป็นเครื่องมือลับให้ล็อกที่ตัวเครื่องมือเอง)</p>
              </div>
            )}
          </section>

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
                {formatNumber(description.length)}/{formatNumber(FREEBIE_LIMITS.description)}
              </span>
            </div>
            {mode === "edit" ? (
              <textarea
                value={description}
                onChange={(e) => touch(setDescription)(e.target.value)}
                rows={14}
                spellCheck={false}
                placeholder={"เขียนด้วย Markdown (ไม่บังคับ)\n\n## ในไฟล์นี้มีอะไร\n- …\n\n## เหมาะกับใคร"}
                className={cn(inputClass, "min-h-[280px] resize-y font-mono text-[14px] leading-[24px]", !descOk && "border-danger/60")}
                aria-label="รายละเอียด (Markdown)"
              />
            ) : (
              <div className="min-h-[280px] rounded-[12px] border border-border bg-bg px-5 py-6 sm:px-8">
                <div className="max-w-[680px] text-[16px] leading-[1.8]">
                  {description.trim() ? <Markdown>{description}</Markdown> : <p className="text-text-2">ยังไม่มีรายละเอียด</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-[16px] border border-border bg-surface p-5">
            <p className="mb-2 text-[13px] font-medium">แจกอะไร</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ประเภทของฟรี">
              {(
                [
                  ["file", "ไฟล์ดาวน์โหลด"],
                  ["tool", "เครื่องมือ / ลิงก์"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => touch(setKind)(k)}
                  className={cn("rounded-[10px] border px-3 py-2.5 text-[13px] font-medium transition-colors", kind === k ? "border-text bg-hover" : "border-border text-text-2 hover:text-text")}
                >
                  {label}
                </button>
              ))}
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
            <p className="t-caption mt-1 text-text-2">ฉบับร่างจะไม่ขึ้นในหน้า /free</p>
            <label className="mt-4 flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block text-[14px] font-medium">ปักหมุดไว้บนสุด</span>
                <span className="t-caption block text-text-2">ขึ้นเป็นชิ้นแรกๆ ในหน้า /free (ต้องเผยแพร่)</span>
              </span>
              <Switch checked={featured} onCheckedChange={touch(setFeatured)} aria-label="ปักหมุดไว้บนสุด" />
            </label>
          </section>
        </aside>
      </div>

      {saved && (
        <section aria-labelledby="claims-h" className="mt-10">
          <h2 id="claims-h" className="t-h2">
            คนที่รับไป
          </h2>
          <p className="t-meta tnum mt-1">
            {formatNumber(initial?.people ?? 0)} คน · {formatNumber(initial?.claims ?? 0)} ครั้ง (ไม่นับแอดมิน)
          </p>
          {claims.length === 0 ? (
            <p className="mt-4 rounded-[16px] border border-border bg-surface px-4 py-6 text-center text-[14px] text-text-2">ยังไม่มีใครรับ</p>
          ) : (
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-surface">
              {claims.map((c) => (
                <li key={c.user_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/studio/members/${c.user_id}`} className="truncate text-[14px] font-medium hover:underline">
                      {c.name}
                    </Link>
                    <p className="t-meta truncate">{c.email}</p>
                  </div>
                  <div className="tnum shrink-0 text-right">
                    <p className="t-meta">{thaiDateTime(c.last_at)}</p>
                    {c.times > 1 && <p className="t-caption text-text-2">{formatNumber(c.times)} ครั้ง</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
