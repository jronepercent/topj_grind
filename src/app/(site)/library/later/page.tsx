import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { popular, progressMap, savedContent } from "@/lib/server/queries";
import { LaterSection } from "../_components/library-view";

export const metadata: Metadata = { title: "ดูภายหลัง", robots: { index: false, follow: false } };

export default async function LibraryLaterPage() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const [later, progress] = await Promise.all([savedContent(viewer.id), progressMap(viewer.id)]);
  return <LaterSection later={later} progress={progress} suggestions={later.length ? [] : await popular(4)} />;
}
