-- Image columns hold URLs only. A base64 data URL in a row is copied into every page, the
-- catalogue cache (2MB cap) and each notification — the server uploads them to Storage instead.
-- Run `npm run db:move-inline-images` first if any rows still hold one.
alter table public.content
  add constraint content_thumbnail_not_inline check (thumbnail_url is null or thumbnail_url not like 'data:%');
alter table public.playlists
  add constraint playlists_thumbnail_not_inline check (thumbnail_url is null or thumbnail_url not like 'data:%');
alter table public.profiles
  add constraint profiles_avatar_not_inline check (avatar_url is null or avatar_url not like 'data:%');
alter table public.notifications
  add constraint notifications_image_not_inline check (image_url is null or image_url not like 'data:%');
alter table public.site_settings
  add constraint site_settings_images_not_inline check (
    coalesce(value->>'avatar_url', '') not like 'data:%' and coalesce(value->>'banner_url', '') not like 'data:%'
  );
