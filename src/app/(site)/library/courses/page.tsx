import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { progressMap } from "@/lib/server/queries";
import { learningCourses } from "../_lib";
import { CoursesSection } from "../_components/library-view";

export const metadata: Metadata = { title: "Playlist ที่กำลังเรียน", robots: { index: false, follow: false } };

export default async function LibraryCoursesPage() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const courses = await learningCourses(viewer.id, await progressMap(viewer.id));
  return <CoursesSection courses={courses} />;
}
