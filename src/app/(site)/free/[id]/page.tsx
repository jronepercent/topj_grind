import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, Download, ExternalLink, FileDown, Gift, Pencil, Wrench } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { getFreebie, hasClaimed } from "@/lib/server/freebies";
import { FreebieClaimLink } from "@/components/free/freebie-claim-link";
import { Markdown } from "@/components/community/markdown";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/shop";
import { FREEBIE_KIND_LABEL, freebieClaimHref, freebieHref, isExternalUrl } from "@/lib/freebies";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const f = await getFreebie(id, null);
  if (!f) return { title: "ไม่พบของฟรี" };
  const description = f.subtitle || "แจกฟรีจาก TOPJ_GRIND สมัครบัญชีฟรีแล้วรับได้เลย";
  return {
    title: `${f.title} (ฟรี)`,
    description,
    alternates: { canonical: freebieHref(id) },
    openGraph: { title: `${f.title} (ฟรี)`, description, url: freebieHref(id), ...(f.cover_url ? { images: [{ url: f.cover_url }] } : {}) },
  };
}

export default async function FreebiePage({ params }: Props) {
  const { id } = await params;
  const viewer = await getViewer();
  const f = await getFreebie(id, viewer);
  if (!f) notFound();
  const claimed = viewer ? await hasClaimed(viewer.id, f.id) : false;
  const published = f.status === "published";
  const isTool = f.kind === "tool";
  const ext = f.file_name?.split(".").pop()?.toUpperCase() ?? "";
  const fileMeta = [/^[A-Z0-9]{1,5}$/.test(ext) ? ext : "", formatFileSize(f.file_size)].filter(Boolean).join(" · ");
  const external = isTool && isExternalUrl(f.url);
  const next = encodeURIComponent(freebieHref(f.id));

  // Signed in: take it straight away (a plain <a>: the route is a redirect and must never be prefetched).
  // Guests: sign up (or log in) first, then land back here.
  const action = viewer ? (
    <Button asChild variant="primary" size="lg" className="h-14 w-full text-[16px]">
      <FreebieClaimLink freebieId={f.id} kind={f.kind} href={freebieClaimHref(f.id)} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {isTool ? <ExternalLink strokeWidth={2} /> : <Download strokeWidth={2} />}
        {isTool ? "เปิดเครื่องมือ" : claimed ? "ดาวน์โหลดอีกครั้ง" : "ดาวน์โหลดฟรี"}
      </FreebieClaimLink>
    </Button>
  ) : (
    <Button asChild variant="primary" size="lg" className="h-14 w-full text-[16px]">
      <Link href={`/signup?next=${next}`}>
        <Gift strokeWidth={2} /> สมัครฟรีเพื่อรับ
      </Link>
    </Button>
  );

  return (
    <div className="tg-page mx-auto max-w-[1100px] px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <Link href="/free" className="-ml-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[14px] text-text-2 hover:bg-hover hover:text-text">
        <ChevronLeft className="size-4" strokeWidth={2} aria-hidden /> ของฟรีทั้งหมด
      </Link>

      {!published && (
        <p role="status" className="mt-3 rounded-[12px] border border-border-strong bg-surface px-4 py-3 text-[14px]">
          ฉบับร่าง — หน้านี้เห็นเฉพาะคุณ คนอื่นยังเปิดไม่ได้{" "}
          <Link href={`/studio/free/${f.id}/edit`} className="font-semibold underline underline-offset-2">
            ไปแก้ไข
          </Link>
        </p>
      )}

      <div className="mt-4 grid gap-8 md:grid-cols-[minmax(0,400px)_minmax(0,1fr)] md:gap-12">
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[400px] overflow-hidden rounded-[16px] border border-border bg-surface md:sticky md:top-[72px] md:self-start">
          {f.cover_url ? (
            <Image src={f.cover_url} alt="" fill priority sizes="(max-width:768px) 100vw, 400px" className="object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-text-2" aria-hidden>
              <Gift className="size-12" strokeWidth={1.25} />
            </span>
          )}
        </div>

        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-hover px-3 py-1 text-[12px] font-semibold">
            {isTool ? <Wrench className="size-3.5" aria-hidden /> : <FileDown className="size-3.5" aria-hidden />}
            {FREEBIE_KIND_LABEL[f.kind]} · ฟรี
          </p>
          <h1 className="t-h1 mt-3 text-balance sm:text-[32px] sm:leading-[40px]">{f.title}</h1>
          {f.subtitle && <p className="mt-2 text-[16px] leading-7 text-text-2">{f.subtitle}</p>}

          <div className="mt-6 max-w-[420px]">
            {action}
            {viewer ? (
              <p className="t-meta mt-2 text-center">{claimed ? "คุณรับไปแล้ว · กดซ้ำได้ไม่จำกัด" : isTool ? "เปิดได้ทุกเมื่อ ไม่มีค่าใช้จ่าย" : fileMeta || "ดาวน์โหลดได้ทันที"}</p>
            ) : (
              <p className="t-meta mt-2 text-center">
                ฟรี ไม่ต้องใช้บัตร · มีบัญชีแล้ว?{" "}
                <Link href={`/login?next=${next}`} className="font-medium text-text underline underline-offset-4">
                  เข้าสู่ระบบ
                </Link>
              </p>
            )}
          </div>
          {viewer?.is_admin && (
            <Button asChild variant="ghost" size="sm" className="mt-2">
              <Link href={`/studio/free/${f.id}/edit`}>
                <Pencil /> แก้ไขใน Studio
              </Link>
            </Button>
          )}

          <section aria-labelledby="gets-h" className="mt-8 rounded-[16px] border border-border bg-surface p-5">
            <h2 id="gets-h" className="text-[16px] font-semibold">
              สิ่งที่คุณจะได้รับ
            </h2>
            <ul className="mt-3 space-y-2.5 text-[15px] leading-6">
              {(isTool ? ["ใช้งานได้ทันที ไม่มีค่าใช้จ่าย", "กลับมาเปิดใช้ซ้ำได้ทุกเมื่อ"] : ["ดาวน์โหลดได้ทันทีหลังสมัคร", "โหลดซ้ำได้ไม่จำกัดครั้ง"]).map((g) => (
                <li key={g} className="flex gap-3">
                  <Check className="mt-1 size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
                  <span>{g}</span>
                </li>
              ))}
              {!isTool && f.file_name && (
                <li className="flex gap-3 text-text-2">
                  <FileDown className="mt-1 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 break-words">
                    {f.file_name}
                    {f.file_size ? ` · ${formatFileSize(f.file_size)}` : ""}
                  </span>
                </li>
              )}
            </ul>
          </section>

          {f.description.trim() && (
            <section aria-labelledby="desc-h" className="mt-10">
              <h2 id="desc-h" className="t-h2">
                รายละเอียด
              </h2>
              <div className="mt-4 max-w-[720px] text-[16px] leading-[1.8] text-text">
                <Markdown>{f.description}</Markdown>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
