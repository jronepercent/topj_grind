import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import { popular, progressMap, search } from "@/lib/server/queries";
import { PlaylistCard, RowCard } from "@/components/cards/cards";
import { ArticleCard } from "@/components/community/article-card";
import { searchArticles } from "@/lib/server/community";
import { ContentGrid } from "@/components/content/feed";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { formatNumber } from "@/lib/format";
import type { ContentType } from "@/lib/types";
import { cn } from "@/lib/utils";

type SearchType = Exclude<ContentType, "short"> | "playlist" | "article";
type SP = Promise<{ q?: string | string[]; type?: string | string[] }>;

const CHIPS: { value: SearchType | undefined; label: string }[] = [
  { value: undefined, label: "ทั้งหมด" },
  { value: "video", label: "วิดีโอ" },
  { value: "podcast", label: "พอดแคสต์" },
  { value: "playlist", label: "Playlist" },
  { value: "article", label: "บทความ" },
];

function parse(sp: Awaited<SP>) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(sp.q).trim().slice(0, 100);
  const t = one(sp.type);
  const type = (["video", "podcast", "playlist", "article"] as const).find((x) => x === t);
  return { q, type };
}

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const { q } = parse(await searchParams);
  return { title: q ? `${q} - ค้นหา` : "ค้นหา", robots: { index: false, follow: true } };
}

function href(q: string, type?: SearchType) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (type) p.set("type", type);
  return `/search?${p.toString()}`;
}

const PLAYLIST_GRID = "grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const { q, type } = parse(await searchParams);
  const viewer = await getViewer();
  const found = q && type !== "article" ? await search(q, type) : { content: [], playlists: [] };
  const content = found.content;
  const playlists = found.playlists;
  const articles = q && (!type || type === "article") ? await searchArticles(q, 12).catch(() => []) : [];
  const rows = content;
  const total = content.length + playlists.length + articles.length;
  const progress = await progressMap(viewer?.id, content.map((c) => c.id));

  return (
    <div className="tg-page mx-auto max-w-[1800px] px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      {q && (
        <nav aria-label="กรองผลการค้นหา" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {CHIPS.map((chip) => {
            const active = chip.value === type;
            return (
              <Link
                key={chip.label}
                href={href(q, chip.value)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors",
                  active ? "bg-text text-bg" : "bg-hover text-text hover:bg-[var(--border-strong)]",
                )}
              >
                {chip.label}
              </Link>
            );
          })}
        </nav>
      )}

      {!q ? (
        <>
          <EmptyState art="search" title="ค้นหาคลิปที่อยากดู" body="ลองพิมพ์ชื่อคลิป หัวข้อ หรือแท็ก เช่น #mindset ที่ช่องค้นหาด้านบน" />
          <PopularBlock />
        </>
      ) : total === 0 ? (
        <>
          <EmptyState art="search" title={`ไม่พบผลลัพธ์สำหรับ “${q}”`} body="ลองใช้คำที่สั้นลง สะกดใหม่ หรือเลือกหมวด “ทั้งหมด”" />
          <PopularBlock />
        </>
      ) : (
        <div className="mt-6 space-y-12">
          <p className="t-meta tnum" role="status">
            พบ {formatNumber(total)} รายการสำหรับ “{q}”
          </p>

          {rows.length > 0 && (
            <section aria-label="วิดีโอและพอดแคสต์" className="max-w-[1100px] space-y-5 sm:space-y-6">
              {rows.map((c) => (
                <RowCard key={c.id} c={c} size="lg" progress={progress} />
              ))}
            </section>
          )}

          {articles.length > 0 && (
            <section aria-label="บทความ" className="max-w-[1100px]">
              <SectionHeader title="บทความ" />
              <div className="space-y-6">
                {articles.map((a) => (
                  <ArticleCard key={a.id} a={a} locked={!viewer?.is_member} />
                ))}
              </div>
            </section>
          )}

          {playlists.length > 0 && (
            <section>
              <SectionHeader title="Playlist" />
              <div className={PLAYLIST_GRID}>
                {playlists.map((p) => (
                  <PlaylistCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

async function PopularBlock() {
  const items = await popular(8);
  if (!items.length) return null;
  return (
    <section className="mt-2">
      <SectionHeader title="คลิปยอดนิยม" />
      <ContentGrid items={items} />
    </section>
  );
}
