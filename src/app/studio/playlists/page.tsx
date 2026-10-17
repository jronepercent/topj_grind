import { db } from "@/lib/server/store";
import { PageHeader } from "@/components/studio/ui";
import { PlaylistsManager, type StudioPlaylist } from "@/components/studio/playlists-manager";
import { pickItems } from "../_lib/data";

export const metadata = { title: "Playlist" };

export default async function StudioPlaylistsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams;
  const d = db();
  const playlists: StudioPlaylist[] = [...d.playlists]
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      thumbnail_url: p.thumbnail_url,
      visibility: p.visibility,
      is_course: p.is_course,
      content_ids: d.playlist_items
        .filter((i) => i.playlist_id === p.id)
        .sort((a, b) => a.position - b.position)
        .map((i) => i.content_id),
    }));
  return (
    <div>
      <PageHeader title="Playlist" description="จัดกลุ่มคลิปเป็นชุด หรือทำเป็นซีรีส์บทเรียนที่มีแถบความคืบหน้า" />
      <PlaylistsManager playlists={playlists} items={pickItems()} openNew={sp.new === "1"} />
    </div>
  );
}
