import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { likedContent, popular, progressMap } from "@/lib/server/queries";
import { LikedSection } from "../_components/library-view";

export const metadata: Metadata = { title: "ที่ถูกใจ", robots: { index: false, follow: false } };

export default async function LibraryLikedPage() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const [liked, progress] = await Promise.all([likedContent(viewer.id), progressMap(viewer.id)]);
  return <LikedSection liked={liked} progress={progress} suggestions={liked.length ? [] : await popular(4)} />;
}
