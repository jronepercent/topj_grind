-- ═══════════════════════════════════════════════════════════════════
-- 0002 — columns and helpers the app layer needs
-- ═══════════════════════════════════════════════════════════════════

-- Captions are stored as VTT text (small) instead of a storage path.
-- The view depends on has_captions, so rebuild it around the column swap.
drop view if exists public.content_public;
alter table public.content drop column has_captions;
alter table public.content drop column captions_path;
alter table public.content add column captions_vtt text;
alter table public.content add column has_captions boolean generated always as (captions_vtt is not null) stored;

-- Sample/seed content plays from a public URL instead of Bunny. Server-only, like bunny_video_id.
alter table public.content add column demo_src text;

create view public.content_public with (security_invoker = true) as
  select id, type, title, description, thumbnail_url, preview_url, duration_sec, width, height,
         visibility, status, media_status, published_at, scheduled_at, category_id, tags,
         comments_enabled, linked_content_id, linked_start_sec, has_captions,
         view_count, like_count, comment_count, deleted_at, created_at, updated_at
  from public.content;
grant select on public.content_public to anon, authenticated;
grant select (has_captions) on public.content to anon, authenticated;

-- Payment webhook finds a user by email. Server (service role) only.
create or replace function public.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;

-- Member numbers for the member card (#0042): order of first payment.
alter table public.subscriptions add column member_no int;
create sequence if not exists public.member_no_seq;
create or replace function public.assign_member_no() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.first_paid_at is not null and new.member_no is null then
    new.member_no := nextval('public.member_no_seq');
  end if;
  return new;
end $$;
create trigger subscriptions_member_no before insert or update of first_paid_at on public.subscriptions
  for each row execute function public.assign_member_no();
revoke all on function public.assign_member_no() from public, anon, authenticated;

-- Site settings live in one row.
insert into public.site_settings (key, value) values ('site', '{}'::jsonb) on conflict do nothing;

-- Faster "continue watching" and engagement lookups.
create index if not exists likes_content_idx on public.likes (content_id);
create index if not exists saved_user_idx on public.saved (user_id, created_at desc);
create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);
create index if not exists playlist_items_pos_idx on public.playlist_items (playlist_id, position);
