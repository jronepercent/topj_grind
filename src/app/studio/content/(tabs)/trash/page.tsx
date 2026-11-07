import { ContentTable } from "@/components/studio/content-table";
import { contentRows } from "../../_data";

export const metadata = { title: "คอนเทนต์ · ถังขยะ" };

export default async function StudioContentTrashPage() {
  const rows = await contentRows();
  return <ContentTable rows={rows} view="trash" />;
}
