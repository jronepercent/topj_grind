import { adminDb, must } from "@/lib/supabase/clients";
import { PageHeader } from "@/components/studio/ui";
import { PlaylistsManager, type StudioPlaylist } from "@/components/studio/playlists-manager";
import type { Playlist, PlaylistItem } from "@/lib/types";
import { fetchAll, pickItems } from "../_lib/data";

export const metadata = { title: "Playlist" };

export default async function StudioPlaylistsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams;
  const db = adminDb();
  const [pls, items, picks] = await Promise.all([
    db.from("playlists").select("*").order("position").order("created_at"),
    fetchAll<PlaylistItem>(
      (from, to) => db.from("playlist_items").select("*").order("playlist_id").order("position").order("content_id").range(from, to),
      "playlist items",
    ),
    pickItems(),
  ]);
  const playlists: StudioPlaylist[] = (must(pls, "playlists") as Playlist[]).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    thumbnail_url: p.thumbnail_url,
    visibility: p.visibility,
    is_course: p.is_course,
    content_ids: items.filter((i) => i.playlist_id === p.id).map((i) => i.content_id),
  }));
  return (
    <div>
      <PageHeader title="Playlist" description="จัดกลุ่มคลิปเป็นชุด หรือทำเป็นซีรีส์บทเรียนที่มีแถบความคืบหน้า" />
      <PlaylistsManager playlists={playlists} items={picks} openNew={sp.new === "1"} />
    </div>
  );
}
