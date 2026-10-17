import { db } from "@/lib/server/store";
import { PageHeader } from "@/components/studio/ui";
import { HomeCuration, type CurationSection } from "@/components/studio/home-curation";
import { pickItems } from "../_lib/data";

export const metadata = { title: "จัดหน้า Home" };

export default async function StudioHomePage() {
  const sections: CurationSection[] = [...db().home_sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ id: s.id, type: s.type, title: s.title, content_ids: [...s.content_ids], enabled: s.enabled }));
  return (
    <div>
      <PageHeader title="จัดหน้า Home" description="เลือกคลิปเด่นใน Hero และจัดลำดับแถบต่าง ๆ บนหน้าแรก" />
      <HomeCuration sections={sections} items={pickItems()} />
    </div>
  );
}
