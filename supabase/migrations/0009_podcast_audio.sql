-- Podcast audio lives in Supabase Storage (private bucket). Playback goes through
-- /api/play/[id], which signs a 6-hour URL with the service role after the access check.

-- Up to 2 GB per episode. NOTE: a bucket limit can never exceed the project-wide "Upload file size limit"
-- (Dashboard → Storage → Settings, Pro plan) — raise that one to at least 2 GB as well.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'podcasts', 'podcasts', false, 2147483648,
  array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac',
    'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/x-flac'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Only admins touch objects through the browser (resumable upload runs as the signed-in admin).
-- Listeners never get a select policy: they receive server-signed URLs instead.
drop policy if exists podcasts_admin_write on storage.objects;
create policy podcasts_admin_write on storage.objects for all
  using (bucket_id = 'podcasts' and public.is_admin())
  with check (bucket_id = 'podcasts' and public.is_admin());
