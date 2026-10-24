import type { ReactNode } from "react";
import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import { categories, continueWatching, getContentsByIds, heroSlides, listContent, playlistsWithMeta, progressMap } from "@/lib/server/queries";
import { HOME_ROW_LIMIT, homeLayout, latestMixed } from "@/lib/server/home";
import { latestArticles } from "@/lib/server/community";
import { Hero } from "@/components/content/hero";
import { HomeFeed } from "@/components/content/home-feed";
import { InfiniteGrid } from "@/components/content/feed";
import { PlaylistCard, PodcastCard, VideoCard } from "@/components/cards/cards";
import { ArticleCard } from "@/components/community/article-card";
import { Row } from "@/components/home/row";
import { ROW_SIZES, ROW_W } from "@/components/home/sizes";
import { SectionHeader } from "@/components/ui/misc";
import { ProductsRow } from "@/components/home/products-row";
import { SPOTLIGHT_COUNT, Spotlight } from "@/components/home/spotlight";
import { shuffle } from "@/lib/utils";

const ALL_QUERY = { types: ["video", "podcast"] as ("video" | "podcast")[] };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const viewer = await getViewer();
  const layout = await homeLayout();
  const has = (type: string) => layout.some((s) => s.type === type);
  const none = Promise.resolve<never[]>([]);

  // Everything below is independent — fetch in parallel, and only what an enabled row needs.
  const [progress, heroItems, mixed, videos, articles, podcasts, playlists, cont, customLists, cats, all] = await Promise.all([
    progressMap(viewer?.id),
    heroSlides(),
    has("latest") ? latestMixed(SPOTLIGHT_COUNT) : none,
    has("videos") ? listContent({ type: "video", limit: 500 }) : none,
    has("articles") ? latestArticles(HOME_ROW_LIMIT).catch(() => []) : none,
    has("podcasts") ? listContent({ type: "podcast", limit: HOME_ROW_LIMIT }) : none,
    has("playlists") ? playlistsWithMeta(viewer?.id).then((p) => p.slice(0, HOME_ROW_LIMIT)) : none,
    has("continue") ? continueWatching(viewer?.id) : none,
    Promise.all(layout.map((s) => (s.type === "custom" ? getContentsByIds(s.content_ids) : Promise.resolve([])))),
    has("all") ? categories() : Promise.resolve([]),
    has("all") ? listContent({ ...ALL_QUERY, limit: 24 }) : none,
  ]);

  const locked = !viewer?.is_member;
  // "วิดีโอ" is a random pick that skips what the spotlight already shows (unless that leaves too few).
  const spotlit = new Set(mixed.slice(0, SPOTLIGHT_COUNT).flatMap((m) => (m.kind === "content" ? [m.c.id] : [])));
  const fresh = videos.filter((c) => !spotlit.has(c.id));
  // The page renders per request (it reads the viewer), so every visit gets a new order.
  const randomVideos = shuffle(fresh.length >= 4 ? fresh : videos).slice(0, HOME_ROW_LIMIT);
  const clip = (c: (typeof videos)[number], i = 0) => (
    <VideoCard key={c.id} c={c} progress={progress} sizes={ROW_SIZES.video} priority={i === 0 && !heroItems.length} />
  );

  const rows: ReactNode[] = layout.map((s, idx) => {
    switch (s.type) {
      case "continue":
        return cont.length ? (
          <Row key={s.id} title={s.title} itemClass={ROW_W.video}>
            {cont.map((c) => (c.type === "podcast" ? <PodcastCard key={c.id} c={c} progress={progress} sizes={ROW_SIZES.podcast} /> : clip(c)))}
          </Row>
        ) : null;
      case "latest":
        return mixed.length ? <Spotlight key={s.id} title={s.title} href="/#all-content" items={mixed} locked={locked} /> : null;
      case "products":
        return <ProductsRow key={s.id} title={s.title} userId={viewer?.id} />;
      case "videos":
        return randomVideos.length ? (
          <Row key={s.id} title={s.title} href="/?filter=video#all-content" itemClass={ROW_W.video} shuffle>
            {randomVideos.map((c, i) => clip(c, idx === 0 ? i : 1))}
          </Row>
        ) : null;
      case "articles":
        // One or two articles look lost in a scrolling row; show them as wide cards instead.
        if (articles.length && articles.length <= 2)
          return (
            <section key={s.id} aria-label={s.title}>
              <SectionHeader
                title={s.title}
                className="mb-3 sm:mb-4"
                action={
                  <Link href="/community/articles" className="shrink-0 text-[14px] font-medium text-text-2 hover:text-text">
                    ดูทั้งหมด
                  </Link>
                }
              />
              <div className={articles.length === 2 ? "grid gap-4 xl:grid-cols-2" : "max-w-[880px]"}>
                {articles.map((a) => (
                  <ArticleCard key={a.id} a={a} locked={locked} className="rounded-[16px] border border-border bg-surface p-3 sm:p-4" />
                ))}
              </div>
            </section>
          );
        return articles.length ? (
          <Row key={s.id} title={s.title} href="/community/articles" itemClass={ROW_W.article}>
            {articles.map((a) => (
              <ArticleCard key={a.id} a={a} locked={locked} variant="tile" />
            ))}
          </Row>
        ) : null;
      case "podcasts":
        return podcasts.length ? (
          <Row key={s.id} title={s.title} href="/podcasts" itemClass={ROW_W.podcast}>
            {podcasts.map((c) => (
              <PodcastCard key={c.id} c={c} queue={podcasts} progress={progress} sizes={ROW_SIZES.podcast} />
            ))}
          </Row>
        ) : null;
      case "playlists":
        return playlists.length ? (
          <Row key={s.id} title={s.title} href="/playlists" itemClass={ROW_W.video}>
            {playlists.map((p) => (
              <PlaylistCard key={p.id} p={p} sizes={ROW_SIZES.video} />
            ))}
          </Row>
        ) : null;
      case "custom": {
        const items = customLists[idx] ?? [];
        return items.length ? (
          <Row key={s.id} title={s.title} itemClass={ROW_W.video}>
            {items.map((c) => (c.type === "podcast" ? <PodcastCard key={c.id} c={c} progress={progress} sizes={ROW_SIZES.podcast} /> : clip(c)))}
          </Row>
        ) : null;
      }
      case "all":
        // Never skipped: it is the "browse everything" area (chips + infinite grid) at the bottom.
        return (
          <section key={s.id} id="all-content" className="scroll-mt-16" aria-label={s.title}>
            <SectionHeader title={s.title} className="mb-1" />
            <HomeFeed categories={cats} initialFilter={filter} progress={progress}>
              <InfiniteGrid initial={all} query={ALL_QUERY} progress={progress} />
            </HomeFeed>
          </section>
        );
      default:
        return null;
    }
  });

  return (
    <div className="tg-page">
      <Hero items={heroItems} />
      <div className="mx-auto max-w-[1800px] space-y-9 overflow-x-clip px-4 pt-6 sm:space-y-11 sm:px-6 lg:px-8">{rows.filter(Boolean)}</div>
    </div>
  );
}
