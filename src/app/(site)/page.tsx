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
  const sections = (await homeSections()).filter((s) => s.enabled);
  const hero = sections.find((s) => s.type === "hero");
  const custom = sections.filter((s) => s.type === "custom");
  // Everything below is independent — fetch in parallel.
  const [progress, heroAll, latest, shorts, podcasts, playlists, cont, customLists, cats] = await Promise.all([
    progressMap(viewer?.id),
    hero ? getContentsByIds(hero.content_ids) : Promise.resolve([]),
    listContent({ type: "video", limit: 8 }),
    listContent({ type: "short", limit: 12 }),
    listContent({ type: "podcast", limit: 12 }),
    playlistsWithMeta(viewer?.id),
    continueWatching(viewer?.id),
    Promise.all(custom.map((s) => getContentsByIds(s.content_ids))),
    categories(),
  ]);
  const heroItems = heroAll.slice(0, 5);
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
          const items = customItems.get(s.id) ?? [];
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
