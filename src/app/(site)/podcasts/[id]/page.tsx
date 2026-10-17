import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { getChapters, getContent, getLinks, getProgress, getResources, listComments, listContent } from "@/lib/server/queries";
import { EpisodeControls, ShowNotes } from "@/components/podcast/podcast-client";
import { Comments } from "@/components/social/comments";
import { ChannelRow } from "@/components/watch/actions-bar";
import { MemberBadge } from "@/components/ui/misc";
import { RowCard } from "@/components/cards/cards";
import { formatLongDuration, thaiDate } from "@/lib/format";
import { contentMetadata, videoJsonLd } from "@/lib/seo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = getContent(id, null);
  return c ? contentMetadata(c, `/podcasts/${id}`) : { title: "ไม่พบตอนนี้" };
}

export default async function EpisodePage({ params }: Props) {
  const { id } = await params;
  const viewer = await getViewer();
  const c = getContent(id, viewer);
  if (!c || c.type !== "podcast") notFound();
  const all = listContent({ type: "podcast", limit: 200 });
  const queue = all.some((x) => x.id === c.id) ? all : [c, ...all];
  const chapters = getChapters(c);
  const p = getProgress(viewer?.id, id);
  const locked = c.visibility === "members" && !viewer?.is_member;
  const more = all.filter((x) => x.id !== id).slice(0, 6);

  return (
    <div className="tg-page mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      {c.visibility === "public" && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd(c, `/podcasts/${id}`)).replace(/</g, "\\u003c") }} />
      )}
      <div className="flex flex-col gap-8 md:flex-row md:items-end">
        <div className="relative mx-auto aspect-square w-full max-w-[320px] shrink-0 overflow-hidden rounded-[20px] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.5)] md:mx-0 md:w-72">
          {c.thumbnail_url && <Image src={c.thumbnail_url} alt="" fill sizes="320px" priority className="object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="t-caption font-semibold uppercase tracking-wider text-text-2">พอดแคสต์ · GRIND TALK</p>
          <h1 className="t-h1 mt-2 text-balance">{c.title}</h1>
          <p className="t-meta tnum mt-2 flex items-center gap-2">
            {thaiDate(c.published_at)} · {formatLongDuration(c.duration_sec)}
            {c.visibility === "members" && <MemberBadge locked={locked} />}
          </p>
          <div className="mt-6">
            <EpisodeControls c={c} queue={queue} chapters={chapters} startAt={p && !p.completed ? p.position_sec : undefined} />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <ChannelRow />
          <ShowNotes c={c} chapters={chapters} links={getLinks(id)} resources={getResources(id)} queue={queue} />
          <Comments contentId={id} visibility={c.visibility} enabled={c.comments_enabled} initial={listComments(id, viewer, { limit: 20 })} />
        </div>
        <aside className="space-y-3">
          <h2 className="t-h2 mb-2">ตอนอื่นๆ</h2>
          {more.map((x) => (
            <RowCard key={x.id} c={x} />
          ))}
        </aside>
      </div>
    </div>
  );
}
