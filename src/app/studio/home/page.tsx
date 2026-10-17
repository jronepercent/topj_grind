import { adminDb, must } from "@/lib/supabase/clients";
import { PageHeader } from "@/components/studio/ui";
import { HomeCuration, type CurationSection } from "@/components/studio/home-curation";
import type { HomeSection } from "@/lib/types";
import { pickItems } from "../_lib/data";

export const metadata = { title: "จัดหน้า Home" };

export default async function StudioHomePage() {
  const [rows, items] = await Promise.all([adminDb().from("home_sections").select("*").order("position"), pickItems()]);
  const sections: CurationSection[] = (must(rows, "home sections") as HomeSection[]).map((s) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    content_ids: [...(s.content_ids ?? [])],
    enabled: s.enabled,
  }));
  return (
    <div>
      <PageHeader title="จัดหน้า Home" description="เลือกคลิปเด่นใน Hero และจัดลำดับแถบต่าง ๆ บนหน้าแรก" />
      <HomeCuration sections={sections} items={items} />
    </div>
  );
}
