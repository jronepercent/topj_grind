import { adminDb, must } from "@/lib/supabase/clients";
import { CategoriesCard } from "@/components/studio/settings-form";
import type { Category } from "@/lib/types";

export const metadata = { title: "ตั้งค่า · หมวดหมู่" };

export default async function StudioSettingsCategoriesPage() {
  const cats = await adminDb().from("categories").select("id, name, position").order("position");
  return <CategoriesCard initial={(must(cats, "categories") as Pick<Category, "id" | "name">[]).map((c) => ({ id: c.id, name: c.name }))} />;
}
