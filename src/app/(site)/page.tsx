import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import {
  categories,
  continueWatching,
  getContentsByIds,
  homeSections,
  listContent,
  playlistsWithMeta,
  progressMap,
} from "@/lib/server/queries";
import { Hero } from "@/components/content/hero";
import { HomeFeed } from "@/components/content/home-feed";
import { ContentGrid, InfiniteGrid, Shelf } from "@/components/content/feed";
import { PlaylistCard, PodcastCard, ShortCard, VideoCard } from "@/components/cards/cards";
import { SectionHeader } from "@/components/ui/misc";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const viewer = await getViewer();
  const sections = homeSections().filter((s) => s.enabled);
  const progress = progressMap(viewer?.id);
  const hero = sections.find((s) => s.type === "hero");
  const heroItems = hero ? getContentsByIds(hero.content_ids).slice(0, 5) : [];

  const latest = listContent({ type: "video", limit: 8 });
  const shorts = listContent({ type: "short", limit: 12 });
  const podcasts = listContent({ type: "podcast", limit: 12 });
  const playlists = playlistsWithMeta(viewer?.id);
  const cont = continueWatching(viewer?.id);
  const more = listContent({ types: ["video", "podcast"], exclude: latest.map((c) => c.id), limit: 24 });

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
        case "shorts":
          return shorts.length ? (
            <Shelf key={s.id} title={s.title || "Shorts"} action={more_link("/shorts")} itemClass="w-[42vw] sm:w-[200px]">
              {shorts.map((c) => (
                <ShortCard key={c.id} c={c} />
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
          const items = getContentsByIds(s.content_ids);
          return items.length ? (
            <Shelf key={s.id} title={s.title} itemClass="w-[78vw] sm:w-[300px]">
              {items.map((c) =>
                c.type === "short" ? <ShortCard key={c.id} c={c} /> : c.type === "podcast" ? <PodcastCard key={c.id} c={c} progress={progress} /> : <VideoCard key={c.id} c={c} progress={progress} />,
              )}
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
        <HomeFeed categories={categories()} initialFilter={filter} progress={progress}>
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
