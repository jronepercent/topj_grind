import { notFound } from "next/navigation";
import { db } from "@/lib/server/store";
import { ContentEditor } from "@/components/studio/content-editor";
import type { EditorData, EditorOptions } from "@/components/studio/types";
import type { ContentRow } from "@/lib/types";

export const metadata = { title: "รายละเอียดคอนเทนต์" };

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const c = d.content.find((x) => x.id === id);
  if (!c || c.deleted_at) notFound();

  // Plain data only — never pass demo_src / bunny ids / audio paths to the browser.
  const data: EditorData = {
    id: c.id,
    type: c.type,
    title: c.title,
    description: c.description,
    thumbnail_url: c.thumbnail_url,
    category_id: c.category_id,
    tags: [...c.tags],
    visibility: c.visibility,
    comments_enabled: c.comments_enabled,
    linked_content_id: c.linked_content_id,
    linked_start_sec: c.linked_start_sec,
    captions_vtt: c.captions_vtt,
    links: d.content_links
      .filter((l) => l.content_id === id)
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ label: l.label, url: l.url })),
    resources: d.content_resources
      .filter((r) => r.content_id === id)
      .sort((a, b) => a.position - b.position)
      .map((r) => ({ id: r.id, file_name: r.file_name, size_bytes: r.size_bytes })),
    playlist_ids: d.playlist_items.filter((p) => p.content_id === id).map((p) => p.playlist_id),
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

  const s = d.site_settings;
  const options: EditorOptions = {
    categories: [...d.categories].sort((a, b) => a.position - b.position).map((x) => ({ id: x.id, name: x.name })),
    playlists: [...d.playlists].sort((a, b) => a.position - b.position).map((p) => ({ id: p.id, title: p.title, visibility: p.visibility })),
    videos: d.content
      .filter((x) => x.type === "video" && !x.deleted_at && x.id !== id)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .map((x) => ({ id: x.id, title: x.title, thumbnail_url: x.thumbnail_url, duration_sec: x.duration_sec })),
    channelName: s.channel_name,
    channelAvatar: s.avatar_url || null,
  };

  return <ContentEditor key={c.id} data={data} options={options} />;
}
