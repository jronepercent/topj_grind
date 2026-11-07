import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { popular, progressMap } from "@/lib/server/queries";
import { historyGroups } from "../_lib";
import { HistorySection } from "../_components/library-view";

export const metadata: Metadata = { title: "ประวัติการดู", robots: { index: false, follow: false } };

export default async function LibraryHistoryPage() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const [groups, progress] = await Promise.all([historyGroups(viewer.id), progressMap(viewer.id)]);
  return <HistorySection groups={groups} saveHistory={viewer.save_history} progress={progress} suggestions={groups.length ? [] : await popular(4)} />;
}
