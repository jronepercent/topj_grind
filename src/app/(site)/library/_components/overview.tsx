import Link from "next/link";
import { PlaylistCard, VideoCard, type ProgressMap } from "@/components/cards/cards";
import { ContentGrid, Shelf } from "@/components/content/feed";
import { ProductCard } from "@/components/shop/product-card";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import type { PurchaseView } from "@/lib/shop";
import type { Content, PlaylistWithMeta } from "@/lib/types";

const seeAll = (href: string) => (
  <Link href={href} className="rounded-md text-[14px] font-medium text-text-2 hover:text-text">
    ดูทั้งหมด
  </Link>
);

/** /library: a shelf per section, "ดูทั้งหมด" goes to that section's own page. */
export function OverviewSection({
  history,
  later,
  liked,
  courses,
  purchases,
  progress,
  suggestions,
}: {
  history: Content[];
  later: Content[];
  liked: Content[];
  courses: PlaylistWithMeta[];
  purchases: PurchaseView[];
  progress: ProgressMap;
  suggestions: Content[];
}) {
  const empty = !history.length && !later.length && !liked.length && !courses.length && !purchases.length;
  return (
    <div className="pt-8">
      {empty ? (
        <>
          <EmptyState art="history" title="ยังไม่ได้ดูอะไรเลย" body="เริ่มจากคลิปแนะนำนี้ แล้วคลิปที่ดู บันทึก และถูกใจจะมาอยู่ที่นี่" />
          {suggestions.length > 0 && (
            <section className="mt-2">
              <SectionHeader title="คลิปแนะนำ" />
              <ContentGrid items={suggestions} progress={progress} />
            </section>
          )}
        </>
      ) : (
        <div className="space-y-12">
          {purchases.length > 0 && (
            <Shelf title="ที่ซื้อแล้ว" action={seeAll("/owned")} itemClass="w-[160px] sm:w-[200px]">
              {purchases.slice(0, 12).map((x) => (
                <ProductCard key={x.id} product={x.product} variant="row" />
              ))}
            </Shelf>
          )}
          {history.length > 0 && (
            <Shelf title="ประวัติการดู" action={seeAll("/library/history")} itemClass="w-[78vw] sm:w-[300px]">
              {history.slice(0, 8).map((c) => (
                <VideoCard key={c.id} c={c} progress={progress} />
              ))}
            </Shelf>
          )}
          {later.length > 0 && (
            <Shelf title="ดูภายหลัง" action={seeAll("/library/later")} itemClass="w-[78vw] sm:w-[300px]">
              {later.slice(0, 8).map((c) => (
                <VideoCard key={c.id} c={c} progress={progress} />
              ))}
            </Shelf>
          )}
          {liked.length > 0 && (
            <Shelf title="ที่ถูกใจ" action={seeAll("/library/liked")} itemClass="w-[78vw] sm:w-[300px]">
              {liked.slice(0, 8).map((c) => (
                <VideoCard key={c.id} c={c} progress={progress} />
              ))}
            </Shelf>
          )}
          {courses.length > 0 && (
            <Shelf title="Playlist ที่กำลังเรียน" action={seeAll("/library/courses")} itemClass="w-[78vw] sm:w-[340px]">
              {courses.slice(0, 8).map((p) => (
                <PlaylistCard key={p.id} p={p} />
              ))}
            </Shelf>
          )}
        </div>
      )}
    </div>
  );
}
