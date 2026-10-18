import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import {
  categories,
  continueWatching,
  getContentsByIds,
  heroSlides,
  homeSections,
  listContent,
  playlistsWithMeta,
  progressMap,
} from "@/lib/server/queries";
import { Hero } from "@/components/content/hero";
import { HomeFeed } from "@/components/content/home-feed";
import { ContentGrid, InfiniteGrid, Shelf } from "@/components/content/feed";
import { PlaylistCard, PodcastCard, VideoCard } from "@/components/cards/cards";
import { ArticleCard } from "@/components/community/article-card";
import { latestArticles } from "@/lib/server/community";
import { SectionHeader } from "@/components/ui/misc";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const viewer = await getViewer();
  const sections = (await homeSections()).filter((s) => s.enabled);
  const custom = sections.filter((s) => s.type === "custom");
  // Everything below is independent — fetch in parallel.
  const [progress, heroItems, latest, articles, podcasts, playlists, cont, customLists, cats] = await Promise.all([
    progressMap(viewer?.id),
    heroSlides(),
    listContent({ type: "video", limit: 8 }),
    latestArticles(6).catch(() => []), // community tables may not be migrated yet
    listContent({ type: "podcast", limit: 12 }),
    playlistsWithMeta(viewer?.id),
    continueWatching(viewer?.id),
    Promise.all(custom.map((s) => getContentsByIds(s.content_ids))),
    categories(),
  ]);
  const customItems = new Map(custom.map((s, i) => [s.id, customLists[i]]));
  const more = await listContent({ types: ["video", "podcast"], exclude: latest.map((c) => c.id), limit: 24 });

  const more_link = (href: string) => (
    <Link href={href} className="text-[14px] font-medium text-text-2 hover:text-text">
      ดูทั้งหมด
    </Link>
  );

  const blocks = sections
    .filter((s) => s.type !== "hero")
    .map((s) => {
      switch (s.type) {
        case "continue":
          return cont.length ? (
            <Shelf key={s.id} title={s.title || "ดูต่อจากที่ค้างไว้"} itemClass="w-[78vw] sm:w-[300px]">
              {cont.map((c) => (c.type === "podcast" ? <PodcastCard key={c.id} c={c} progress={progress} /> : <VideoCard key={c.id} c={c} progress={progress} />))}
            </Shelf>
          ) : null;
        case "latest":
          return latest.length ? (
            <section key={s.id}>
              <SectionHeader title={s.title || "ใหม่ล่าสุด"} />
              <ContentGrid items={latest} progress={progress} priorityFirst={!heroItems.length} />
            </section>
          ) : null;
        case "shorts": // legacy section type: the Shorts shelf now shows the latest articles
          return articles.length ? (
            <Shelf
              key={s.id}
              title={!s.title || /short/i.test(s.title) ? "บทความจาก JR" : s.title}
              action={more_link("/community/articles")}
              itemClass="w-[78vw] sm:w-[300px]"
            >
              {articles.map((a) => (
                <ArticleCard key={a.id} a={a} locked={!viewer?.is_member} variant="tile" />
              ))}
            </Shelf>
          ) : null;
        case "podcasts":
          return podcasts.length ? (
            <Shelf key={s.id} title={s.title || "พอดแคสต์"} action={more_link("/podcasts")} itemClass="w-[44vw] sm:w-[220px]">
              {podcasts.map((c) => (
                <PodcastCard key={c.id} c={c} queue={podcasts} progress={progress} />
              ))}
            </Shelf>
          ) : null;
        case "playlists":
          return playlists.length ? (
            <Shelf key={s.id} title={s.title || "Playlist และซีรีส์"} action={more_link("/playlists")} itemClass="w-[78vw] sm:w-[340px]">
              {playlists.map((p) => (
                <PlaylistCard key={p.id} p={p} />
              ))}
            </Shelf>
          ) : null;
        case "custom": {
          const items = customItems.get(s.id) ?? [];
          return items.length ? (
            <Shelf key={s.id} title={s.title} itemClass="w-[78vw] sm:w-[300px]">
              {items.map((c) => (c.type === "podcast" ? <PodcastCard key={c.id} c={c} progress={progress} /> : <VideoCard key={c.id} c={c} progress={progress} />))}
            </Shelf>
          ) : null;
        }
        default:
          return null;
      }
    })
    .filter(Boolean);

  return (
    <div className="tg-page">
      <Hero items={heroItems} />
      <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <HomeFeed categories={cats} initialFilter={filter} progress={progress}>
          <div className="space-y-12">
            {blocks}
            {more.length > 0 && (
              <section>
                <SectionHeader title="คอนเทนต์ทั้งหมด" />
                <InfiniteGrid initial={more} query={{ types: ["video", "podcast"], exclude: latest.map((c) => c.id) }} progress={progress} />
              </section>
            )}
          </div>
        </HomeFeed>
      </div>
    </div>
  );
}
