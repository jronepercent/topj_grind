"use client";
import * as React from "react";
import Link from "next/link";
import { Headphones, Trash2, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { clearHistoryAction, setSaveHistoryAction, toggleSaveAction } from "@/app/actions";
import { PlaylistCard, Thumb, VideoCard, type ProgressMap } from "@/components/cards/cards";
import { ContentMenu } from "@/components/cards/content-menu";
import { ContentGrid, Shelf } from "@/components/content/feed";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, MemberBadge, SectionHeader, type ArtKind } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useViewer } from "@/components/providers";
import { contentHref, formatCount, formatDuration, timeAgo, TYPE_LABEL } from "@/lib/format";
import type { Content, PlaylistWithMeta } from "@/lib/types";
import { cn } from "@/lib/utils";

export type LibraryTab = "overview" | "history" | "later" | "liked" | "courses";
export interface HistoryGroup {
  key: string;
  label: string;
  items: Content[];
}

const TAB_LABEL: Record<LibraryTab, string> = {
  overview: "ภาพรวม",
  history: "ประวัติการดู",
  later: "ดูภายหลัง",
  liked: "ที่ถูกใจ",
  courses: "Playlist ที่กำลังเรียน",
};

export function LibraryView(props: {
  initialTab: LibraryTab;
  history: HistoryGroup[];
  later: Content[];
  liked: Content[];
  courses: PlaylistWithMeta[];
  progress: ProgressMap;
  saveHistory: boolean;
  suggestions: Content[];
}) {
  const { progress, suggestions, liked, courses } = props;
  const [tab, setTab] = React.useState<LibraryTab>(props.initialTab);
  const [groups, setGroups] = React.useState(props.history);
  const [later, setLater] = React.useState(props.later);
  const [saveHistory, setSaveHistory] = React.useState(props.saveHistory);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);

  const historyItems = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const go = React.useCallback((t: LibraryTab) => {
    setTab(t);
    const url = t === "overview" ? "/library" : `/library?tab=${t}`;
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }, []);

  // ── History ──
  const removeFromHistory = async (id: string) => {
    const prev = groups;
    setGroups((gs) => gs.map((g) => ({ ...g, items: g.items.filter((c) => c.id !== id) })).filter((g) => g.items.length));
    const r = await clearHistoryAction(id);
    if (!r.ok) {
      setGroups(prev);
      toast(r.error);
    } else toast("ลบออกจากประวัติแล้ว");
  };

  const clearAll = async () => {
    setClearing(true);
    const r = await clearHistoryAction();
    setClearing(false);
    setConfirmClear(false);
    if (!r.ok) return toast(r.error);
    setGroups([]);
    toast("ล้างประวัติการดูแล้ว");
  };

  const toggleSaveHistory = async (on: boolean) => {
    setSaveHistory(on);
    const r = await setSaveHistoryAction(on);
    if (!r.ok) {
      setSaveHistory(!on);
      return toast(r.error);
    }
    toast(on ? "เปิดบันทึกประวัติการดูแล้ว" : "หยุดบันทึกประวัติการดูแล้ว");
  };

  // ── Watch later ──
  const removeFromLater = async (c: Content) => {
    const index = later.findIndex((x) => x.id === c.id);
    setLater((xs) => xs.filter((x) => x.id !== c.id));
    const r = await toggleSaveAction(c.id, false);
    if (!r.ok) {
      setLater((xs) => insertAt(xs, c, index));
      return toast(r.error);
    }
    toast("นำออกจากดูภายหลังแล้ว", {
      action: {
        label: "เลิกทำ",
        onClick: async () => {
          setLater((xs) => (xs.some((x) => x.id === c.id) ? xs : insertAt(xs, c, index)));
          const u = await toggleSaveAction(c.id, true);
          if (!u.ok) {
            setLater((xs) => xs.filter((x) => x.id !== c.id));
            toast(u.error);
          }
        },
      },
    });
  };

  const emptyAll = !historyItems.length && !later.length && !liked.length && !courses.length;

  const suggestionsBlock = suggestions.length > 0 && (
    <section className="mt-2">
      <SectionHeader title="คลิปแนะนำ" />
      <ContentGrid items={suggestions} progress={progress} />
    </section>
  );

  const seeAll = (t: LibraryTab) => (
    <button onClick={() => go(t)} className="rounded-md text-[14px] font-medium text-text-2 hover:text-text">
      ดูทั้งหมด
    </button>
  );

  return (
    <Tabs value={tab} onValueChange={(v) => go(v as LibraryTab)} className="mt-4">
      <TabsList aria-label="หมวดในคลัง" className="-mx-4 px-4 sm:mx-0 sm:px-0">
        {(Object.keys(TAB_LABEL) as LibraryTab[]).map((t) => (
          <TabsTrigger key={t} value={t}>
            {TAB_LABEL[t]}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* ───── Overview ───── */}
      <TabsContent value="overview" className="pt-8 outline-none">
        {emptyAll ? (
          <>
            <EmptyState art="history" title="ยังไม่ได้ดูอะไรเลย" body="เริ่มจากคลิปแนะนำนี้ แล้วคลิปที่ดู บันทึก และถูกใจจะมาอยู่ที่นี่" />
            {suggestionsBlock}
          </>
        ) : (
          <div className="space-y-12">
            {historyItems.length > 0 && (
              <Shelf title="ประวัติการดู" action={seeAll("history")} itemClass="w-[78vw] sm:w-[300px]">
                {historyItems.slice(0, 8).map((c) => (
                  <VideoCard key={c.id} c={c} progress={progress} />
                ))}
              </Shelf>
            )}
            {later.length > 0 && (
              <Shelf title="ดูภายหลัง" action={seeAll("later")} itemClass="w-[78vw] sm:w-[300px]">
                {later.slice(0, 8).map((c) => (
                  <VideoCard key={c.id} c={c} progress={progress} />
                ))}
              </Shelf>
            )}
            {liked.length > 0 && (
              <Shelf title="ที่ถูกใจ" action={seeAll("liked")} itemClass="w-[78vw] sm:w-[300px]">
                {liked.slice(0, 8).map((c) => (
                  <VideoCard key={c.id} c={c} progress={progress} />
                ))}
              </Shelf>
            )}
            {courses.length > 0 && (
              <Shelf title="Playlist ที่กำลังเรียน" action={seeAll("courses")} itemClass="w-[78vw] sm:w-[340px]">
                {courses.slice(0, 8).map((p) => (
                  <PlaylistCard key={p.id} p={p} />
                ))}
              </Shelf>
            )}
          </div>
        )}
      </TabsContent>

      {/* ───── History ───── */}
      <TabsContent value="history" className="pt-6 outline-none">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-12">
          <aside className="lg:order-2 lg:sticky lg:top-[72px] lg:self-start">
            <div className="rounded-[16px] border border-border bg-surface p-5">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span>
                  <span className="block text-[15px] font-medium">บันทึกประวัติการดู</span>
                  <span className="t-meta mt-0.5 block">
                    {saveHistory ? "ใช้จำว่าดูถึงไหน และความคืบหน้าของซีรีส์" : "ปิดอยู่ — คลิปที่ดูหลังจากนี้จะไม่ถูกบันทึก"}
                  </span>
                </span>
                <Switch checked={saveHistory} onCheckedChange={toggleSaveHistory} aria-label="บันทึกประวัติการดู" />
              </label>
              <div className="my-4 h-px bg-border" />
              <Button variant="ghost" className="-mx-2 w-[calc(100%+16px)] justify-start px-2" disabled={!historyItems.length} onClick={() => setConfirmClear(true)}>
                <Trash2 strokeWidth={1.75} /> ล้างประวัติการดูทั้งหมด
              </Button>
            </div>
          </aside>

          <div className="min-w-0 lg:order-1">
            {groups.length === 0 ? (
              <>
                <EmptyState art="history" title="ยังไม่ได้ดูอะไรเลย" body="เริ่มจากคลิปแนะนำนี้ แล้วระบบจะจำให้ว่าดูถึงไหน" className="pt-6" />
                {suggestionsBlock}
              </>
            ) : (
              <div className="space-y-10">
                {groups.map((g) => (
                  <section key={g.key} aria-label={g.label}>
                    <h2 className="mb-4 text-[17px] font-semibold">{g.label}</h2>
                    <ul className="space-y-4">
                      {g.items.map((c) => (
                        <li key={c.id}>
                          <LibRow c={c} progress={progress} onRemove={() => removeFromHistory(c.id)} removeLabel="ลบออกจากประวัติการดู" />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </TabsContent>

      {/* ───── Watch later ───── */}
      <TabsContent value="later" className="pt-6 outline-none">
        <List
          items={later}
          progress={progress}
          onRemove={removeFromLater}
          removeLabel="นำออกจากดูภายหลัง"
          empty={{ art: "bookmark", title: "ยังไม่มีคลิปที่บันทึกไว้", body: "กด ⋮ บนคลิปแล้วเลือก “ดูภายหลัง” คลิปจะมารออยู่ที่นี่" }}
          suggestions={suggestionsBlock}
        />
      </TabsContent>

      {/* ───── Liked ───── */}
      <TabsContent value="liked" className="pt-6 outline-none">
        <List
          items={liked}
          progress={progress}
          empty={{ art: "heart", title: "ยังไม่มีคลิปที่ถูกใจ", body: "กดถูกใจคลิปที่ชอบ แล้วกลับมาดูซ้ำได้ที่นี่" }}
          suggestions={suggestionsBlock}
        />
      </TabsContent>

      {/* ───── Courses ───── */}
      <TabsContent value="courses" className="pt-8 outline-none">
        {courses.length === 0 ? (
          <EmptyState
            art="play"
            title="ยังไม่ได้เริ่มเรียน Playlist ไหน"
            body="เลือกซีรีส์บทเรียนสักชุด แล้วเรียนเป็นลำดับ ระบบจะเก็บความคืบหน้าให้"
            action={
              <Button asChild variant="inverse">
                <Link href="/playlists">ดู Playlist ทั้งหมด</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courses.map((p) => (
              <PlaylistCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </TabsContent>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-sm" hideClose>
          <DialogTitle>ล้างประวัติการดูทั้งหมด?</DialogTitle>
          <DialogDescription className="mt-2">
            ความคืบหน้าการดูและความคืบหน้าของซีรีส์จะถูกลบทั้งหมด และกู้คืนไม่ได้
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">ยกเลิก</Button>
            </DialogClose>
            <Button variant="danger" onClick={clearAll} disabled={clearing}>
              {clearing ? "กำลังล้าง…" : "ล้างประวัติ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

function insertAt<T>(xs: T[], x: T, i: number) {
  const out = [...xs];
  out.splice(Math.max(0, Math.min(i, out.length)), 0, x);
  return out;
}

function List({
  items,
  progress,
  onRemove,
  removeLabel,
  empty,
  suggestions,
}: {
  items: Content[];
  progress: ProgressMap;
  onRemove?: (c: Content) => void;
  removeLabel?: string;
  empty: { art: ArtKind; title: string; body: string };
  suggestions: React.ReactNode;
}) {
  if (!items.length) {
    return (
      <>
        <EmptyState art={empty.art} title={empty.title} body={empty.body} className="pt-6" />
        {suggestions}
      </>
    );
  }
  return (
    <ul className="max-w-[1100px] space-y-4">
      {items.map((c) => (
        <li key={c.id}>
          <LibRow c={c} progress={progress} onRemove={onRemove ? () => onRemove(c) : undefined} removeLabel={removeLabel} />
        </li>
      ))}
    </ul>
  );
}

/** Uniform 16:9 row for every content type (shorts and podcasts included). */
function LibRow({ c, progress, onRemove, removeLabel }: { c: Content; progress: ProgressMap; onRemove?: () => void; removeLabel?: string }) {
  const { viewer } = useViewer();
  const href = contentHref(c);
  const p = progress[c.id];
  const ratio = p?.completed ? 1 : p && c.duration_sec ? p.position_sec / c.duration_sec : 0;
  const locked = c.visibility === "members" && !viewer?.is_member;
  return (
    <article className="group relative flex gap-3 sm:gap-4">
      <Link href={href} className="w-[42%] min-w-[140px] max-w-[280px] shrink-0 rounded-[12px]" aria-label={c.title}>
        <Thumb src={c.thumbnail_url} alt="" sizes="(max-width:640px) 42vw, 280px">
          {c.visibility === "members" && <MemberBadge locked={locked} className={cn("absolute left-2 top-2", !locked && "bg-black/60 backdrop-blur")} />}
          {c.type !== "video" && (
            <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {c.type === "short" ? <Zap className="size-3" /> : <Headphones className="size-3" />} {TYPE_LABEL[c.type]}
            </span>
          )}
          <span className="tnum absolute bottom-1.5 right-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {formatDuration(c.duration_sec)}
          </span>
          {ratio > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25" aria-hidden>
              <span className="block h-full bg-accent" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
            </span>
          )}
        </Thumb>
      </Link>
      <div className="min-w-0 flex-1 py-0.5">
        <Link href={href} className="rounded-md">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-[21px] sm:text-[17px] sm:leading-6">{c.title}</h3>
        </Link>
        <p className="t-meta tnum mt-1">
          การดู {formatCount(c.view_count)} ครั้ง · {timeAgo(c.published_at)}
        </p>
        <p className="t-meta mt-2 hidden sm:line-clamp-2">{c.description.split("\n")[0]}</p>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1 self-start">
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded-full p-1.5 text-text-2 transition-colors hover:bg-hover hover:text-text"
            aria-label={`${removeLabel ?? "นำออก"}: ${c.title}`}
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        )}
        <ContentMenu content={c} />
      </div>
    </article>
  );
}
