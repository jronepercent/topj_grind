"use client";
import * as React from "react";
import { Gauge } from "lucide-react";
import { PodcastPlayButton, toPlayerItem } from "@/components/cards/cards";
import { DescriptionBox } from "@/components/watch/description-box";
import { useViewer } from "@/components/providers";
import { usePlayer } from "@/lib/stores/player";
import type { Chapter, Content, ContentLink, ContentResource } from "@/lib/types";
import { cn } from "@/lib/utils";

const SPEEDS = [0.8, 1, 1.25, 1.5, 2];

/** Big play + speed + show notes whose timestamps drive the global player. */
export function EpisodeControls({ c, queue, chapters, startAt }: { c: Content; queue: Content[]; chapters: Chapter[]; startAt?: number }) {
  const current = usePlayer((s) => s.item?.id === c.id);
  const rate = usePlayer((s) => s.rate);
  const controls = usePlayer((s) => s.controls);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <PodcastPlayButtonWithChapters c={c} queue={queue} chapters={chapters} startAt={startAt} />
      <div className="flex items-center gap-1 rounded-full bg-hover p-1" role="group" aria-label="ความเร็ว">
        <Gauge className="ml-2 size-4 text-text-2" />
        {SPEEDS.map((s) => (
          <button
            key={s}
            disabled={!current}
            onClick={() => controls?.setRate(s)}
            className={cn("tnum rounded-full px-2.5 py-1 text-[13px] font-medium disabled:opacity-40", current && rate === s ? "bg-text text-bg" : "hover:bg-[var(--border-strong)]")}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}

function PodcastPlayButtonWithChapters({ c, queue, chapters, startAt }: { c: Content; queue: Content[]; chapters: Chapter[]; startAt?: number }) {
  // Seed chapters into the player item so the full sheet can show them.
  const current = usePlayer((s) => s.item?.id === c.id);
  React.useEffect(() => {
    if (!current) return;
    const s = usePlayer.getState();
    if (s.item && !s.item.chapters) usePlayer.setState({ item: { ...s.item, chapters } });
  }, [current, chapters]);
  return <PodcastPlayButton c={c} queue={queue} size="lg" startAt={startAt} />;
}

export function ShowNotes({
  c,
  chapters,
  links,
  resources,
  queue,
}: {
  c: Content;
  chapters: Chapter[];
  links: ContentLink[];
  resources: Omit<ContentResource, "storage_path">[];
  queue: Content[];
}) {
  const { viewer, openPaywall } = useViewer();
  const locked = c.visibility === "members" && !viewer?.is_member;
  const onTime = (t: number) => {
    if (locked) return openPaywall(c.thumbnail_url);
    const s = usePlayer.getState();
    if (s.item?.id === c.id && s.controls) s.controls.seek(t);
    else s.play({ ...toPlayerItem(c), chapters, startAt: t }, queue.slice(queue.findIndex((q) => q.id === c.id) + 1).map(toPlayerItem));
  };
  return <DescriptionBox c={c} chapters={chapters} links={links} resources={resources} onTime={onTime} label="การฟัง" />;
}
