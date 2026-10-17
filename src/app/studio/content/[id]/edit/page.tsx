import { notFound } from "next/navigation";
import { adminDb, must } from "@/lib/supabase/clients";
import { getContentRow, siteSettings } from "@/lib/server/queries";
import { ContentEditor } from "@/components/studio/content-editor";
import type { EditorData, EditorOptions } from "@/components/studio/types";
import type { Category, ContentLink, ContentResource, ContentRow, Playlist } from "@/lib/types";
import { fetchAll } from "../../../_lib/data";

export const metadata = { title: "รายละเอียดคอนเทนต์" };

type VideoOption = Pick<ContentRow, "id" | "title" | "thumbnail_url" | "duration_sec">;

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getContentRow(id); // null for junk ids and trashed rows
  if (!c) notFound();

  const db = adminDb();
  const [links, resources, memberships, cats, pls, videos, s] = await Promise.all([
    db.from("content_links").select("label, url, position").eq("content_id", id).order("position"),
    db.from("content_resources").select("id, file_name, size_bytes, position").eq("content_id", id).order("position"),
    db.from("playlist_items").select("playlist_id").eq("content_id", id),
    db.from("categories").select("id, name, position").order("position"),
    db.from("playlists").select("id, title, visibility, position").order("position"),
    fetchAll<VideoOption>(
      (from, to) =>
        db
          .from("content")
          .select("id, title, thumbnail_url, duration_sec")
          .eq("type", "video")
          .is("deleted_at", null)
          .neq("id", id)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      "videos",
    ),
    siteSettings(),
  ]);

  // Plain data only — never pass demo_src / bunny ids / audio paths to the browser.
  const data: EditorData = {
    id: c.id,
    type: c.type,
    title: c.title,
    description: c.description,
    thumbnail_url: c.thumbnail_url,
    category_id: c.category_id,
    tags: [...(c.tags ?? [])],
    visibility: c.visibility,
    comments_enabled: c.comments_enabled,
    linked_content_id: c.linked_content_id,
    linked_start_sec: c.linked_start_sec,
    captions_vtt: c.captions_vtt,
    links: (must(links, "links") as Pick<ContentLink, "label" | "url">[]).map((l) => ({ label: l.label, url: l.url })),
    resources: (must(resources, "resources") as Pick<ContentResource, "id" | "file_name" | "size_bytes">[]).map((r) => ({
      id: r.id,
      file_name: r.file_name,
      size_bytes: Number(r.size_bytes),
    })),
    playlist_ids: (must(memberships, "playlist items") as { playlist_id: string }[]).map((p) => p.playlist_id),
    status: c.status,
    publish_when_ready: !!c.publish_when_ready,
    scheduled_at: c.scheduled_at,
    published_at: c.published_at,
    media_status: c.media_status,
    duration_sec: c.duration_sec,
    width: c.width,
    height: c.height,
    updated_at: c.updated_at,
  };

  const options: EditorOptions = {
    categories: (must(cats, "categories") as Pick<Category, "id" | "name">[]).map((x) => ({ id: x.id, name: x.name })),
    playlists: (must(pls, "playlists") as Pick<Playlist, "id" | "title" | "visibility">[]).map((p) => ({ id: p.id, title: p.title, visibility: p.visibility })),
    videos: videos.map((x) => ({ id: x.id, title: x.title, thumbnail_url: x.thumbnail_url, duration_sec: x.duration_sec })),
    channelName: s.channel_name,
    channelAvatar: s.avatar_url || null,
  };

  return <ContentEditor key={c.id} data={data} options={options} />;
}
