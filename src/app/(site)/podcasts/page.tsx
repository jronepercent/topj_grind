import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import { listContent, progressMap } from "@/lib/server/queries";
import { PodcastPlayButton } from "@/components/cards/cards";
import { EmptyState, MemberBadge } from "@/components/ui/misc";
import { formatLongDuration, thaiDate } from "@/lib/format";

export const metadata: Metadata = { title: "พอดแคสต์", description: "GRIND TALK — พอดแคสต์จาก JR" };

export default async function PodcastsPage() {
  const viewer = await getViewer();
  const eps = listContent({ type: "podcast", limit: 200 });
  const progress = progressMap(viewer?.id);
  if (!eps.length) return <EmptyState title="ยังไม่มีพอดแคสต์" body="ตอนใหม่กำลังมา" />;
  const [latest, ...rest] = eps;
  const pct = (id: string, dur: number) => {
    const p = progress[id];
    if (!p) return 0;
    return p.completed ? 100 : Math.round((p.position_sec / Math.max(1, dur)) * 100);
  };

  return (
    <div className="tg-page mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <h1 className="t-h1 mb-6">พอดแคสต์</h1>

      {/* Hero: latest episode */}
      <section className="flex flex-col gap-6 rounded-[20px] border border-border bg-surface p-5 sm:flex-row sm:items-center sm:p-6">
        <Link href={`/podcasts/${latest.id}`} className="relative aspect-square w-full shrink-0 overflow-hidden rounded-[16px] shadow-2xl sm:w-56">
          {latest.thumbnail_url && <Image src={latest.thumbnail_url} alt="" fill sizes="(max-width:640px) 100vw, 224px" priority className="object-cover" />}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="t-caption font-semibold uppercase tracking-wider text-accent">ตอนล่าสุด</p>
          <Link href={`/podcasts/${latest.id}`}>
            <h2 className="t-h1 mt-2 text-balance">{latest.title}</h2>
          </Link>
          <p className="t-meta tnum mt-2">
            {thaiDate(latest.published_at)} · {formatLongDuration(latest.duration_sec)}
          </p>
          <p className="mt-3 line-clamp-2 text-[15px] text-text-2">{latest.description.split("\n")[0]}</p>
          <div className="mt-5 flex items-center gap-3">
            <PodcastPlayButton c={latest} queue={eps} size="lg" startAt={progress[latest.id]?.completed ? 0 : progress[latest.id]?.position_sec} />
            {latest.visibility === "members" && <MemberBadge locked={!viewer?.is_member} />}
          </div>
        </div>
      </section>

      <h2 className="t-h2 mb-2 mt-10">ทุกตอน</h2>
      <ol className="divide-y divide-border">
        {rest.map((c) => {
          const p = pct(c.id, c.duration_sec);
          return (
            <li key={c.id} className="flex items-center gap-4 py-4">
              <Link href={`/podcasts/${c.id}`} className="relative size-20 shrink-0 overflow-hidden rounded-[12px] bg-surface sm:size-24">
                {c.thumbnail_url && <Image src={c.thumbnail_url} alt="" fill sizes="96px" className="object-cover" />}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="t-caption tnum text-text-2">{thaiDate(c.published_at)}</p>
                <Link href={`/podcasts/${c.id}`}>
                  <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-[21px]">{c.title}</h3>
                </Link>
                <p className="t-meta tnum mt-1 flex flex-wrap items-center gap-2">
                  {formatLongDuration(c.duration_sec)}
                  {p > 0 && (
                    <span className="flex items-center gap-1.5">
                      · <span className="inline-block h-1 w-12 overflow-hidden rounded-full bg-[var(--border-strong)]"><span className="block h-full bg-accent" style={{ width: `${p}%` }} /></span>
                      {p === 100 ? "ฟังจบแล้ว" : `ฟังไปแล้ว ${p}%`}
                    </span>
                  )}
                  {c.visibility === "members" && <MemberBadge locked={!viewer?.is_member} />}
                </p>
              </div>
              <PodcastPlayButton c={c} queue={eps} startAt={progress[c.id]?.completed ? 0 : progress[c.id]?.position_sec} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
