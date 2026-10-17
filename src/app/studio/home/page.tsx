import { adminDb, must } from "@/lib/supabase/clients";
import { PageHeader } from "@/components/studio/ui";
import { HomeCuration, type CurationSection } from "@/components/studio/home-curation";
import { HeroEditor } from "@/components/studio/hero-editor";
import type { HeroSlideRow, HomeSection } from "@/lib/types";
import { pickItems } from "../_lib/data";

export const metadata = { title: "จัดหน้า Home" };

export default async function StudioHomePage() {
  const db = adminDb();
  const [rows, slides, descs, items] = await Promise.all([
    db.from("home_sections").select("*").order("position"),
    db.from("hero_slides").select("*").order("position"),
    db.from("content").select("id, description").is("deleted_at", null),
    pickItems(),
  ]);
  const all = must(rows, "home sections") as HomeSection[];
  const sections: CurationSection[] = all
    .filter((s) => s.type !== "hero")
    .map((s) => ({ id: s.id, type: s.type, title: s.title, content_ids: [...(s.content_ids ?? [])], enabled: s.enabled }));
  const descriptions = Object.fromEntries(
    (must(descs, "descriptions") as { id: string; description: string }[]).map((d) => [d.id, d.description.split("\n")[0].slice(0, 200)]),
  );
  return (
    <div className="space-y-6">
      <PageHeader title="จัดหน้า Home" description="ตั้งค่า Hero และจัดลำดับแถบต่าง ๆ บนหน้าแรก" />
      <HeroEditor
        enabled={all.find((s) => s.type === "hero")?.enabled ?? true}
        slides={must(slides, "hero slides") as HeroSlideRow[]}
        items={items}
        descriptions={descriptions}
      />
      <HomeCuration sections={sections} items={items} />
    </div>
  );
}
