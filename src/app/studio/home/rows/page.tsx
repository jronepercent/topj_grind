import { HomeCuration, type CurationSection } from "@/components/studio/home-curation";
import { homePickItems, homeSections } from "../_data";

export const metadata = { title: "จัดหน้า Home · แถบหน้าแรก" };

export default async function StudioHomeRowsPage() {
  const [all, items] = await Promise.all([homeSections(), homePickItems()]);
  const sections: CurationSection[] = all
    .filter((s) => s.type !== "hero")
    .map((s) => ({ id: s.id, type: s.type, title: s.title, content_ids: [...(s.content_ids ?? [])], enabled: s.enabled }));
  return <HomeCuration sections={sections} items={items} />;
}
