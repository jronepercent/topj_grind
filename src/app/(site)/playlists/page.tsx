import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import { playlistsWithMeta } from "@/lib/server/queries";
import { PlaylistCard } from "@/components/cards/cards";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "Playlist และซีรีส์บทเรียน",
  description: "รวม Playlist และซีรีส์บทเรียนจาก TOPJ_GRIND เรียนต่อเนื่องเป็นลำดับ ตั้งแต่พื้นฐานจนลงมือทำได้จริง",
};

export default async function PlaylistsPage() {
  const viewer = await getViewer();
  const playlists = await playlistsWithMeta(viewer?.id);
  const courses = playlists.filter((p) => p.is_course);
  const others = playlists.filter((p) => !p.is_course);

  return (
    <div className="tg-page mx-auto max-w-[1800px] px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <header className="mb-8">
        <h1 className="t-h1">Playlist และซีรีส์บทเรียน</h1>
        <p className="t-meta tnum mt-2">{formatNumber(playlists.length)} รายการ · เรียนเป็นลำดับ ระบบจำให้ว่าดูถึงไหนแล้ว</p>
      </header>

      {playlists.length === 0 ? (
        <EmptyState
          title="ยังไม่มี Playlist"
          body="JR กำลังจัดคลิปเป็นซีรีส์อยู่ ระหว่างนี้ดูคลิปล่าสุดก่อนได้เลย"
          action={
            <Button asChild variant="inverse">
              <Link href="/">ไปหน้าแรก</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-12">
          {courses.length > 0 && <Group title="ซีรีส์บทเรียน" items={courses} />}
          {others.length > 0 && <Group title={courses.length ? "Playlist อื่นๆ" : "Playlist ทั้งหมด"} items={others} />}
        </div>
      )}
    </div>
  );
}

function Group({ title, items }: { title: string; items: Awaited<ReturnType<typeof playlistsWithMeta>> }) {
  return (
    <section>
      <h2 className="t-h2 mb-4">{title}</h2>
      <div className="grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((p) => (
          <PlaylistCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}
