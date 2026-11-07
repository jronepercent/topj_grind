import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { listFreebies } from "@/lib/server/freebies";
import { listProducts } from "@/lib/server/shop";
import { FreebieCard } from "@/components/free/freebie-card";
import { ProductCard } from "@/components/shop/product-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { HubTabs } from "@/components/shell/hub-tabs";

export const metadata: Metadata = {
  title: "ของฟรี",
  description: "ไฟล์ เทมเพลต และเครื่องมือสำหรับคนทำ Digital Product จาก TOPJ_GRIND แจกฟรี สมัครบัญชีฟรีแล้วโหลดได้เลย",
  alternates: { canonical: "/free" },
};

/**
 * /free — the one link for bios and clip CTAs. Everything here needs a (free) sign-in to take, which is the point:
 * each take is a lead (freebie_claims / sample_downloads). Two sections: JR's freebies, then free samples of shop products.
 */
export default async function FreePage() {
  const viewer = await getViewer();
  const [freebies, products] = await Promise.all([listFreebies(), listProducts({ userId: viewer?.id })]);
  const samples = products.filter((p) => p.has_sample && !p.owned);

  return (
    <div className="tg-page mx-auto max-w-[1400px] px-4 pb-16 sm:px-6 lg:px-8">
      <HubTabs active="free" />
      <header className="max-w-2xl pt-5 sm:pt-6">
        <h1 className="t-h1">ของฟรี</h1>
        <p className="mt-2 text-[16px] leading-7 text-text-2">ไฟล์ เทมเพลต และเครื่องมือที่ JR ใช้จริง แจกฟรีทั้งหมด เลือกชิ้นที่ใช่แล้วกดรับได้เลย</p>
        {!viewer && (
          <div className="mt-5 rounded-[16px] border border-border bg-surface p-4 sm:flex sm:items-center sm:gap-4 sm:p-5">
            <ul className="min-w-0 flex-1 space-y-1.5 text-[14px] leading-6">
              {["สมัครบัญชีฟรี ไม่ต้องใช้บัตร", "สมัครครั้งเดียว รับได้ทุกชิ้น"].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <Check className="mt-1 size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <Button asChild variant="primary" size="lg" className="mt-4 w-full sm:mt-0 sm:w-auto">
              <Link href="/signup?next=%2Ffree">สมัครฟรีเพื่อรับของ</Link>
            </Button>
          </div>
        )}
      </header>

      {freebies.length === 0 && samples.length === 0 ? (
        <EmptyState art="bookmark" className="py-20" title="กำลังเตรียมของฟรี" body="กลับมาใหม่เร็วๆ นี้ ชุดแรกใกล้เสร็จแล้ว" />
      ) : (
        <>
          {freebies.length > 0 && (
            <section aria-labelledby="free-h" className="mt-8">
              <h2 id="free-h" className="t-h2">
                แจกฟรี
              </h2>
              <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-4 md:grid-cols-3 xl:grid-cols-4">
                {freebies.map((f, i) => (
                  <li key={f.id} className="min-w-0">
                    <FreebieCard item={f} priority={i < 4} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {samples.length > 0 && (
            <section aria-labelledby="samples-h" className="mt-12">
              <h2 id="samples-h" className="t-h2">
                ตัวอย่างฟรีจากร้านค้า
              </h2>
              <p className="t-meta mt-1">โหลดบทตัวอย่างไปอ่านก่อน ชอบค่อยซื้อเล่มเต็ม</p>
              <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-4 md:grid-cols-3 xl:grid-cols-4">
                {samples.map((p) => (
                  <li key={p.id} className="min-w-0">
                    <ProductCard product={p} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
