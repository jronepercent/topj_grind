import { cache } from "react";
import { adminDb, must } from "@/lib/supabase/clients";
import type { HomeSection } from "@/lib/types";
import { pickItems } from "../_lib/data";

/** Content picker items, shared by every Home tab (cached per request). */
export const homePickItems = cache(pickItems);

/** All home_sections rows ordered by position (cached per request). */
export const homeSections = cache(async (): Promise<HomeSection[]> => {
  const rows = await adminDb().from("home_sections").select("*").order("position");
  return must(rows, "home sections") as HomeSection[];
});

/** id → first line of description, for the Hero editor's slide hints. */
export const homeDescriptions = cache(async (): Promise<Record<string, string>> => {
  const descs = await adminDb().from("content").select("id, description").is("deleted_at", null);
  return Object.fromEntries(
    (must(descs, "descriptions") as { id: string; description: string }[]).map((d) => [d.id, d.description.split("\n")[0].slice(0, 200)]),
  );
});
