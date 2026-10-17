import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Headphones, Lock, Play, RotateCcw, Zap } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { getPlaylist, playlistItems, progressMap } from "@/lib/server/queries";
import { Button } from "@/components/ui/button";
import { MemberBadge } from "@/components/ui/misc";
import { contentHref, formatDuration, formatLongDuration, formatNumber, TYPE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const p = await getPlaylist(id, null);
  if (!p) return { title: "ไม่พบ Playlist" };
  return {
    title: p.title,
    description: p.description.slice(0, 160) || `${p.item_count} ตอน · ${formatLongDuration(p.total_sec)}`,
    openGraph: { title: p.title, images: p.first_thumb ? [p.first_thumb] : undefined },
  };
}

export default async function PlaylistPage({ params }: { params: Params }) {
  const { id } = await params;
  const viewer = await getViewer();
  const playlist = await getPlaylist(id, viewer?.id);
  if (!playlist) notFound();

  const items = await playlistItems(id);
  const progress = await progressMap(viewer?.id, items.map((c) => c.id));
  const withList = (c: { id: string; type: string }) => `${contentHref(c)}?list=${encodeURIComponent(id)}`;
  const firstUnfinished = items.find((c) => !progress[c.id]?.completed) ?? items[0];
  const started = items.some((c) => progress[c.id]);
  const done = playlist.completed_count;
  const pct = playlist.item_count ? Math.round((done / playlist.item_count) * 100) : 0;
  const showProgress = playlist.is_course && !!viewer;

  return (
    <div className="tg-page mx-auto max-w-[1800px] px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,400px)_1fr] lg:gap-10">
        {/* ── Left: playlist panel (sticky on desktop, stacked on mobile) ── */}
        <aside className="lg:sticky lg:top-[72px] lg:self-start">
          <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
            <div className="relative aspect-video bg-elevated">
              {playlist.first_thumb && (
                <Image src={playlist.first_thumb} alt="" fill priority sizes="(max-width:1024px) 100vw, 400px" className="object-cover" />
              )}
              {playlist.visibility === "members" && (
                <MemberBadge locked={!viewer?.is_member} className="absolute left-3 top-3 bg-black/60 backdrop-blur" />
              )}
            </div>
            <div className="p-5 sm:p-6">
              <p className="t-caption font-medium text-text-2">{playlist.is_course ? "ซีรีส์บทเรียน" : "Playlist"}</p>
              <h1 className="t-h1 mt-1 text-balance">{playlist.title}</h1>
              <p className="t-meta tnum mt-2">
                {formatNumber(playlist.item_count)} ตอน · {formatLongDuration(playlist.total_sec)}
              </p>
              {playlist.description && <p className="mt-4 whitespace-pre-line text-[14px] leading-[22px] text-text-2">{playlist.description}</p>}

              {showProgress && (
                <div className="mt-5">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-medium">
                      เรียนแล้ว <span className="tnum">{done}/{playlist.item_count}</span>
                    </span>
                    <span className="tnum text-text-2">{pct}%</span>
                  </div>
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-hover"
                    role="progressbar"
                    aria-label="ความคืบหน้าของซีรีส์"
                    aria-valuemin={0}
                    aria-valuemax={playlist.item_count}
                    aria-valuenow={done}
                  >
                    <div className={cn("h-full rounded-full", pct === 100 ? "bg-success" : "bg-accent")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}

              {items.length > 0 && (
                <div className="mt-6 grid grid-cols-2 gap-2">
                  <Button asChild variant="inverse" size="lg" className="px-4">
                    <Link href={withList(firstUnfinished)}>
                      <Play className="fill-current" strokeWidth={0} /> {started ? "เล่นต่อ" : "เริ่มเล่น"}
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" size="lg" className="px-4">
                    <Link href={withList(items[0])}>
                      <RotateCcw strokeWidth={1.75} /> เล่นตั้งแต่ต้น
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ── Right: ordered items ── */}
        <section aria-label="รายการตอน">
          <ol className="space-y-1">
            {items.map((c, i) => {
              const p = progress[c.id];
              const completed = !!p?.completed;
              const ratio = completed ? 1 : p && c.duration_sec ? p.position_sec / c.duration_sec : 0;
              const locked = c.visibility === "members" && !viewer?.is_member;
              const current = c.id === firstUnfinished?.id && started && !completed;
              return (
                <li key={c.id}>
                  <Link
                    href={withList(c)}
                    className={cn("group flex items-center gap-3 rounded-[12px] p-2 transition-colors hover:bg-hover sm:gap-4", current && "bg-hover")}
                    aria-label={`ตอนที่ ${i + 1}: ${c.title}${completed ? " (ดูจบแล้ว)" : ""}${locked ? " (เฉพาะสมาชิก)" : ""}`}
                  >
                    <span className="tnum w-6 shrink-0 text-center text-[13px] text-text-2" aria-hidden>
                      {completed ? <Check className="mx-auto size-4 text-success" strokeWidth={2.25} /> : i + 1}
                    </span>
                    <span className="relative aspect-video w-[120px] shrink-0 overflow-hidden rounded-[10px] bg-surface sm:w-[168px]">
                      {c.thumbnail_url && (
                        <Image
                          src={c.thumbnail_url}
                          alt=""
                          fill
                          sizes="168px"
                          className={cn("object-cover transition-transform duration-150 group-hover:scale-[1.02]", locked && "opacity-80")}
                        />
                      )}
                      <span className="tnum absolute bottom-1 right-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
                        {formatDuration(c.duration_sec)}
                      </span>
                      {ratio > 0 && (
                        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25" aria-hidden>
                          <span className="block h-full bg-accent" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[14px] font-semibold leading-5 sm:text-[15px] sm:leading-[21px]">{c.title}</span>
                      <span className="t-meta tnum mt-1 flex items-center gap-1.5">
                        {c.type === "short" && <Zap className="size-3" aria-hidden />}
                        {c.type === "podcast" && <Headphones className="size-3" aria-hidden />}
                        {TYPE_LABEL[c.type]} · {formatLongDuration(c.duration_sec)}
                        {completed && <span className="text-success">· ดูจบแล้ว</span>}
                      </span>
                    </span>
                    {locked && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-member/15 px-2 py-1 text-[11px] font-semibold text-member">
                        <Lock className="size-3" strokeWidth={2.25} aria-hidden />
                        <span className="hidden sm:inline">สมาชิก</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
