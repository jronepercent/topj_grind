import { adminDb, must } from "@/lib/supabase/clients";
import { HeroEditor } from "@/components/studio/hero-editor";
import type { HeroSlideRow } from "@/lib/types";
import { homeDescriptions, homePickItems, homeSections } from "./_data";

export const metadata = { title: "จัดหน้า Home · Hero" };

export default async function StudioHomeHeroPage() {
  const [all, slides, descriptions, items] = await Promise.all([
    homeSections(),
    adminDb().from("hero_slides").select("*").order("position"),
    homeDescriptions(),
    homePickItems(),
  ]);
  return (
    <HeroEditor
      enabled={all.find((s) => s.type === "hero")?.enabled ?? true}
      slides={must(slides, "hero slides") as HeroSlideRow[]}
      items={items}
      descriptions={descriptions}
    />
  );
}
