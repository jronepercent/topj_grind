import { redirect } from "next/navigation";
import { ContentTable } from "@/components/studio/content-table";
import { contentRows } from "../_data";

export const metadata = { title: "คอนเทนต์" };

export default async function StudioContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  if (tab === "trash") redirect("/studio/content/trash");
  const rows = await contentRows();
  return <ContentTable rows={rows} view="all" />;
}
