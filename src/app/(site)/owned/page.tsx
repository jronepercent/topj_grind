import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Download, ExternalLink, Gift, GraduationCap, ShoppingBag } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { myPurchases, mySamples } from "@/lib/server/shop";
import { myFreebies } from "@/lib/server/freebies";
import { HubTabs } from "@/components/shell/hub-tabs";
import { LoginButton } from "@/components/shell/login-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { thaiDate } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/plans";
import { PRODUCT_TYPE_LABEL, deliveryInfo, formatBaht, productHref } from "@/lib/shop";
import { FREEBIE_KIND_LABEL, freebieHref } from "@/lib/freebies";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "สินค้าของฉัน", robots: { index: false, follow: false } };

/** What a row is: the tag on it and its colour. */
const SOURCE = {
  purchase: { label: "ซื้อแล้ว", className: "bg-accent/15 text-accent" },
  freebie: { label: "ของฟรี", className: "bg-success/15 text-success" },
  sample: { label: "ตัวอย่างฟรี", className: "border border-border text-text-2" },
} as const;

type Item = {
  key: string;
  at: string;
  source: keyof typeof SOURCE;
  href: string;
  cover: string | null;
  kind: string;
  title: string;
  meta: string;
  actions: ReactNode;
};

/**
 * /owned — "สินค้าของฉัน": everything this person has in one list, newest first, so nothing they paid for or took is buried.
 * Paid products (download / start the course), freebies they took (download again / open the tool), and free samples they
 * downloaded from products they have not bought (download again + a way to the full product).
 */
export default async function OwnedPage() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Shell>
        <EmptyState
          art="bookmark"
          className="py-24"
          title="เข้าสู่ระบบเพื่อดูสินค้าของคุณ"
          body="ของที่ซื้อ ของฟรีที่รับไว้ และไฟล์ตัวอย่างที่โหลดไป จะรวมอยู่ที่นี่ โหลดซ้ำได้ตลอด"
          action={<LoginButton />}
        />
      </Shell>
    );
  }

  const [purchases, freebies, samples] = await Promise.all([myPurchases(viewer.id), myFreebies(viewer.id), mySamples(viewer.id)]);

  const items: Item[] = [
    ...purchases.map((x): Item => {
      const p = x.product;
      const isCourse = p.product_type === "course" && !!p.course_playlist_id;
      return {
        key: `p-${x.id}`,
        at: x.paid_at,
        source: "purchase",
        href: productHref(p.id),
        cover: p.cover_url,
        kind: PRODUCT_TYPE_LABEL[p.product_type],
        title: p.title,
        meta: `ซื้อเมื่อ ${thaiDate(x.paid_at)} · ${x.amount > 0 ? formatBaht(x.amount) : "ฟรี"} · ${PAYMENT_METHOD_LABEL[x.method]}`,
        actions: (
          <>
            {isCourse && (
              <Button asChild variant="primary" size="sm">
                <Link href={`/playlists/${p.course_playlist_id}`}>
                  <GraduationCap /> {deliveryInfo(p.product_type).libraryAction}
                </Link>
              </Button>
            )}
            {p.has_file && (
              <Button asChild variant={isCourse ? "secondary" : "primary"} size="sm">
                <a href={`/api/shop/download/${p.id}`}>
                  <Download /> {isCourse ? "ดาวน์โหลดไฟล์ประกอบ" : deliveryInfo(p.product_type).libraryAction}
                </a>
              </Button>
            )}
          </>
        ),
      };
    }),
    ...freebies.map(({ freebie: f, at }): Item => ({
      key: `f-${f.id}`,
      at,
      source: "freebie",
      href: freebieHref(f.id),
      cover: f.cover_url,
      kind: FREEBIE_KIND_LABEL[f.kind],
      title: f.title,
      meta: `รับเมื่อ ${thaiDate(at)}`,
      actions: (
        <Button asChild variant="primary" size="sm">
          {f.kind === "tool" ? (
            <a href={`/api/free/${f.id}`} target="_blank" rel="noopener">
              <ExternalLink /> เปิดเครื่องมือ
            </a>
          ) : (
            <a href={`/api/free/${f.id}`}>
              <Download /> โหลดอีกครั้ง
            </a>
          )}
        </Button>
      ),
    })),
    ...samples.map(({ product: p, at }): Item => ({
      key: `s-${p.id}`,
      at,
      source: "sample",
      href: productHref(p.id),
      cover: p.cover_url,
      kind: PRODUCT_TYPE_LABEL[p.product_type],
      title: p.title,
      meta: `โหลดตัวอย่างเมื่อ ${thaiDate(at)}`,
      actions: (
        <>
          <Button asChild variant="secondary" size="sm">
            <a href={`/api/shop/sample/${p.id}`}>
              <Download /> โหลดตัวอย่างอีกครั้ง
            </a>
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link href={productHref(p.id)}>
              <ShoppingBag /> ซื้อฉบับเต็ม {formatBaht(p.price_thb)}
            </Link>
          </Button>
        </>
      ),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Shell count={items.length}>
      {items.length === 0 ? (
        <EmptyState
          art="bookmark"
          className="py-20"
          title="ยังไม่มีสินค้า"
          body="ของที่ซื้อจากร้านค้า ของฟรีที่รับไว้ และไฟล์ตัวอย่างที่โหลดไป จะมารออยู่ที่นี่ โหลดซ้ำได้ตลอด"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="inverse">
                <Link href="/free">
                  <Gift /> รับของฟรี
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/shop">ไปดูร้านค้า</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <ul className="mt-5 max-w-[900px] space-y-3">
          {items.map((x) => (
            <Row key={x.key} x={x} />
          ))}
        </ul>
      )}
    </Shell>
  );
}

function Shell({ count, children }: { count?: number; children: ReactNode }) {
  return (
    <div className="tg-page mx-auto max-w-[1400px] px-4 pb-16 sm:px-6 lg:px-8">
      <HubTabs active="owned" />
      <header className="pt-5 sm:pt-6">
        <h1 className="t-h1">สินค้าของฉัน</h1>
        <p className="mt-1 text-[15px] leading-6 text-text-2">
          {count ? `${count} ชิ้น · ` : ""}ของที่ซื้อและของฟรีทั้งหมดอยู่ที่นี่ โหลดซ้ำได้ตลอด
        </p>
      </header>
      {children}
    </div>
  );
}

function Row({ x }: { x: Item }) {
  const tag = SOURCE[x.source];
  return (
    <li className="flex gap-3 rounded-[16px] border border-border bg-surface p-3 sm:gap-4 sm:p-4">
      <Link href={x.href} className="relative aspect-[4/5] w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-elevated sm:w-24" aria-label={x.title}>
        {x.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={x.cover} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        ) : (
          <span className="flex size-full items-center justify-center text-text-2" aria-hidden>
            {x.source === "purchase" ? <ShoppingBag className="size-5" strokeWidth={1.5} /> : <Gift className="size-5" strokeWidth={1.5} />}
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold leading-4", tag.className)}>{tag.label}</span>
          <span className="t-caption font-medium text-text-2">{x.kind}</span>
        </p>
        <Link href={x.href} className="mt-1 block rounded-md">
          <h2 className="line-clamp-2 text-[15px] font-semibold leading-[21px] sm:text-[16px] sm:leading-6">{x.title}</h2>
        </Link>
        <p className="t-meta tnum mt-1">{x.meta}</p>
        <div className="mt-3 flex flex-wrap gap-2">{x.actions}</div>
      </div>
    </li>
  );
}
