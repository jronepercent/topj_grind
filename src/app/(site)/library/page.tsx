import { redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { history, likedContent, popular, progressMap, savedContent } from "@/lib/server/queries";
import { myPurchases } from "@/lib/server/shop";
import { learningCourses } from "./_lib";
import { OverviewSection } from "./_components/overview";

const SECTIONS = ["history", "later", "liked", "courses", "purchases"];

export default async function LibraryOverviewPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // Old links: /library?tab=purchases -> /library/purchases (?tab=overview -> /library)
  const { tab } = await searchParams;
  if (tab && SECTIONS.includes(tab)) redirect(`/library/${tab}`);

  const viewer = await getViewer();
  if (!viewer) return null; // the layout shows the sign-in prompt

  const [hist, later, liked, purchases, progress] = await Promise.all([
    history(viewer.id),
    savedContent(viewer.id),
    likedContent(viewer.id),
    myPurchases(viewer.id),
    progressMap(viewer.id),
  ]);
  const courses = await learningCourses(viewer.id, progress);
  const items = hist.map((h) => h.content);
  const empty = !items.length && !later.length && !liked.length && !courses.length && !purchases.length;
  return (
    <OverviewSection
      history={items}
      later={later}
      liked={liked}
      courses={courses}
      purchases={purchases}
      progress={progress}
      suggestions={empty ? await popular(4) : []}
    />
  );
}
