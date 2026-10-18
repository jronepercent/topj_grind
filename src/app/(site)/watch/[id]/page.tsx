import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import {
  canWatch,
  ownedCourseContentIds,
  getChapters,
  getContent,
  getLinks,
  getPlaylist,
  getProgress,
  getResources,
  hasLiked,
  hasSaved,
  listComments,
  playlistItems,
  progressMap,
  related,
} from "@/lib/server/queries";
import { WatchClient } from "@/components/watch/watch-client";
import { ActionsBar, ChannelRow } from "@/components/watch/actions-bar";
import { DescriptionBox } from "@/components/watch/description-box";
import { Comments } from "@/components/social/comments";
import { MemberBadge } from "@/components/ui/misc";
import { contentMetadata, videoJsonLd } from "@/lib/seo";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ list?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = await getContent(id, null);
  return c ? contentMetadata(c, `/watch/${id}`) : { title: "ไม่พบคลิป" };
}

export default async function WatchPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { list } = await searchParams;
  const viewer = await getViewer();
  const c = await getContent(id, viewer);
  if (!c) notFound();
  if (c.type === "short") redirect("/community");
  if (c.type === "podcast") redirect(`/podcasts/${id}`);

  // Buyers of a course product can watch its members-only lessons without a membership.
  const unlockedSet = viewer && !viewer.is_member ? await ownedCourseContentIds(viewer.id).catch(() => null) : null;
  const locked = !canWatch(viewer, c, unlockedSet);
  const chapters = getChapters(c);
  // Independent lookups in parallel — this page's server time is the sum of the slowest, not of all.
  const [p, pl, rel, comments, liked, saved, links, resources] = await Promise.all([
    getProgress(viewer?.id, id),
    list ? getPlaylist(list, viewer?.id) : Promise.resolve(null),
    related(c, 14),
    listComments(id, viewer, { sort: "top", limit: 20 }),
    hasLiked(viewer?.id, id),
    hasSaved(viewer?.id, id),
    getLinks(id),
    getResources(id),
  ]);
  const plItems = pl ? await playlistItems(pl.id) : [];
  const inList = pl && plItems.some((x) => x.id === id);
  const progress = await progressMap(viewer?.id, [...rel.map((r) => r.id), ...plItems.map((x) => x.id)]);

  return (
    <div className="tg-page">
      {c.visibility === "public" && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd(c, `/watch/${id}`)).replace(/</g, "\\u003c") }} />
      )}
      <WatchClient
        data={{
          c,
          locked,
          chapters,
          resume: p && !p.completed && p.position_sec > 5 && p.position_sec < c.duration_sec - 10 ? p.position_sec : null,
          related: rel,
          playlist: inList ? { meta: pl, items: plItems } : null,
          progress,
          unlockedIds: unlockedSet ? [...unlockedSet].filter((x) => x === id || rel.some((r) => r.id === x) || plItems.some((p) => p.id === x)) : [],
        }}
      >
        <div className="flex items-start gap-2">
          <h1 className="t-h2 flex-1 sm:text-[22px] sm:leading-[30px]">{c.title}</h1>
          {c.visibility === "members" && <MemberBadge locked={locked} className="mt-1.5 shrink-0" />}
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ChannelRow />
          <ActionsBar c={c} liked={liked} saved={saved} />
        </div>
        <div className="mt-4">
          <DescriptionBox c={c} chapters={chapters} links={links} resources={resources} unlocked={!!unlockedSet?.has(id)} />
        </div>
        <div className="mt-6">
          <Comments contentId={id} visibility={c.visibility} enabled={c.comments_enabled} initial={comments} />
        </div>
      </WatchClient>
    </div>
  );
}
