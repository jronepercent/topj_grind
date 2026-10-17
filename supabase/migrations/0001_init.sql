-- ═══════════════════════════════════════════════════════════════════
-- TOPJ_GRIND — initial schema (spec §10) + Row Level Security (§11)
-- Mirrors src/lib/server/store.ts so the demo query layer can be ported 1:1.
-- ═══════════════════════════════════════════════════════════════════
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_cron;

-- ───────── Profiles & membership ─────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  is_banned boolean not null default false,
  autoplay boolean not null default true,
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  save_history boolean not null default true,
  created_at timestamptz not null default now()
);

-- is_member = expires_at > now()  — never store an "active" flag.
create table public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  expires_at timestamptz,
  first_paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null,
  currency text not null default 'THB',
  months int not null default 1 check (months > 0),
  method text not null,
  reference text not null unique,
  paid_at timestamptz not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table public.payment_errors (
  id uuid primary key default gen_random_uuid(),
  payload jsonb,
  reason text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Helpers used by RLS (security definer so they can read across tables)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from subscriptions where user_id = auth.uid() and expires_at > now()
  );
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and not is_banned);
$$;

-- New auth user → profile + empty subscription
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into subscriptions (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ───────── Content ─────────
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  position int not null default 0
);

-- array_to_string is only STABLE; generated columns need IMMUTABLE. Tags are plain text, so this is safe.
create or replace function public.tags_text(tags text[]) returns text
language sql immutable parallel safe as $$ select coalesce(array_to_string(tags, ' '), '') $$;

create table public.content (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('video','short','podcast')),
  title text not null check (char_length(title) <= 100),
  description text not null default '' check (char_length(description) <= 5000),
  thumbnail_url text,
  preview_url text,
  bunny_video_id text unique,
  audio_path text,
  duration_sec int not null default 0,
  width int, height int,
  visibility text not null default 'public' check (visibility in ('public','members')),
  status text not null default 'draft' check (status in ('draft','scheduled','published')),
  media_status text not null default 'uploading' check (media_status in ('uploading','processing','ready','failed')),
  publish_when_ready boolean not null default false,
  published_at timestamptz,
  scheduled_at timestamptz,
  category_id uuid references public.categories(id) on delete set null,
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  comments_enabled boolean not null default true,
  linked_content_id uuid references public.content(id) on delete set null,
  linked_start_sec int,
  captions_path text,
  has_captions boolean generated always as (captions_path is not null) stored,
  view_count int not null default 0,
  like_count int not null default 0,
  comment_count int not null default 0,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', public.tags_text(tags)), 'B') ||
    setweight(to_tsvector('simple', coalesce(description,'')), 'C')
  ) stored,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_feed_idx on public.content (type, status, published_at desc);
create index content_search_idx on public.content using gin (search_vector);
create index content_tags_idx on public.content using gin (tags);
create index content_title_trgm_idx on public.content using gin (title extensions.gin_trgm_ops);

-- A clip is on the site only when published + media ready + publish time passed.
create or replace function public.content_is_live(c public.content) returns boolean
language sql stable as $$
  select c.deleted_at is null and c.media_status = 'ready' and c.status = 'published'
     and c.published_at is not null and c.published_at <= now();
$$;

-- Policy helpers: run as owner so they work even though browsers can't read every content column.
create or replace function public.content_visible(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from content c where c.id = cid and public.content_is_live(c));
$$;

create or replace function public.can_engage(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from content c where c.id = cid and public.content_is_live(c)
                 and (c.visibility = 'public' or public.is_member()));
$$;

create or replace function public.can_comment(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from content c where c.id = cid and public.content_is_live(c) and c.comments_enabled
                 and (c.visibility = 'public' or public.is_member()));
$$;

-- Browser-safe view: metadata only. Media locations (bunny_video_id, audio_path,
-- captions_path) are NOT exposed — playback URLs come from /api/play/[id] only.
create view public.content_public with (security_invoker = true) as
  select id, type, title, description, thumbnail_url, preview_url, duration_sec, width, height,
         visibility, status, media_status, published_at, scheduled_at, category_id, tags,
         comments_enabled, linked_content_id, linked_start_sec, has_captions,
         view_count, like_count, comment_count, deleted_at, created_at, updated_at
  from public.content;

create table public.content_links (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content(id) on delete cascade,
  label text not null, url text not null check (url ~* '^https?://'), position int not null default 0
);
create table public.content_chapters (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content(id) on delete cascade,
  start_sec int not null, title text not null, position int not null default 0
);
create table public.content_resources (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content(id) on delete cascade,
  file_name text not null, storage_path text not null, size_bytes bigint not null default 0, position int not null default 0
);

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text not null default '', thumbnail_url text,
  visibility text not null default 'public' check (visibility in ('public','members')),
  is_course boolean not null default false, position int not null default 0,
  created_at timestamptz not null default now()
);
create table public.playlist_items (
  playlist_id uuid references public.playlists(id) on delete cascade,
  content_id uuid references public.content(id) on delete cascade,
  position int not null default 0,
  primary key (playlist_id, content_id)
);

-- ───────── Engagement ─────────
create table public.watch_progress (
  user_id uuid references public.profiles(id) on delete cascade,
  content_id uuid references public.content(id) on delete cascade,
  position_sec int not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, content_id)
);
create index watch_progress_recent_idx on public.watch_progress (user_id, updated_at desc);

create table public.likes (
  user_id uuid references public.profiles(id) on delete cascade,
  content_id uuid references public.content(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);
create table public.saved (
  user_id uuid references public.profiles(id) on delete cascade,
  content_id uuid references public.content(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);
create table public.views (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  session_id text not null,
  watched_sec int not null default 0,
  created_at timestamptz not null default now()
);
create index views_content_time_idx on public.views (content_id, created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  like_count int not null default 0,
  is_pinned boolean not null default false,
  creator_hearted boolean not null default false,
  is_hidden boolean not null default false,
  edited_at timestamptz, deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index comments_content_idx on public.comments (content_id, created_at);

-- one level of nesting only
create or replace function public.comments_one_level() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- moderation flags and counters can't be set by the author on insert
  if not public.is_admin() then
    new.like_count := 0; new.is_pinned := false; new.creator_hearted := false;
    new.is_hidden := false; new.edited_at := null; new.deleted_at := null; new.created_at := now();
    if exists (select 1 from banned_words w where position(lower(w.word) in lower(new.body)) > 0) then
      raise exception 'comment contains a banned word' using errcode = '22023';
    end if;
  end if;
  if new.parent_id is not null and exists (select 1 from comments where id = new.parent_id and parent_id is not null) then
    raise exception 'replies can only be one level deep';
  end if;
  return new;
end $$;
create trigger comments_one_level before insert on public.comments for each row execute function public.comments_one_level();

-- Non-admins may change ONLY body (stamps edited_at) and deleted_at (set once, never undone).
-- Counters (like_count) are maintained by triggers below (nested → pg_trigger_depth() > 1).
create or replace function public.comments_guard_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or pg_trigger_depth() > 1 then return new; end if;
  if new.content_id is distinct from old.content_id or new.parent_id is distinct from old.parent_id
     or new.user_id is distinct from old.user_id or new.like_count is distinct from old.like_count
     or new.is_pinned is distinct from old.is_pinned or new.creator_hearted is distinct from old.creator_hearted
     or new.is_hidden is distinct from old.is_hidden or new.created_at is distinct from old.created_at
     or (old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at) then
    raise exception 'not allowed to change these comment fields' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then
    if exists (select 1 from banned_words w where position(lower(w.word) in lower(new.body)) > 0) then
      raise exception 'comment contains a banned word' using errcode = '22023';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;
create trigger comments_guard_update before update on public.comments for each row execute function public.comments_guard_update();

-- ───────── Counters (users never write them directly) ─────────
create or replace function public.bump_content_likes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update content set like_count = greatest(0, like_count + case when tg_op = 'INSERT' then 1 else -1 end)
   where id = coalesce(new.content_id, old.content_id);
  return null;
end $$;
create trigger likes_count after insert or delete on public.likes for each row execute function public.bump_content_likes();

create or replace function public.bump_comment_likes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update comments set like_count = greatest(0, like_count + case when tg_op = 'INSERT' then 1 else -1 end)
   where id = coalesce(new.comment_id, old.comment_id);
  return null;
end $$;

create or replace function public.bump_comment_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update content set comment_count = comment_count + 1 where id = new.content_id;
  elsif old.deleted_at is null and new.deleted_at is not null then
    update content set comment_count = greatest(0, comment_count - 1) where id = new.content_id;
  end if;
  return null;
end $$;
create trigger comments_count after insert or update of deleted_at on public.comments for each row execute function public.bump_comment_count();

create or replace function public.bump_view_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update content set view_count = view_count + 1 where id = new.content_id;
  return null;
end $$;
create trigger views_count after insert on public.views for each row execute function public.bump_view_count();

create table public.comment_likes (
  user_id uuid references public.profiles(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  primary key (user_id, comment_id)
);
create trigger comment_likes_count after insert or delete on public.comment_likes for each row execute function public.bump_comment_likes();

create table public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text, created_at timestamptz not null default now()
);
create table public.banned_words (id uuid primary key default gen_random_uuid(), word text not null unique);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null, title text not null, body text not null default '',
  link text, image_url text, read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.home_sections (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('hero','continue','latest','shorts','podcasts','playlists','custom')),
  title text not null default '', content_ids uuid[] not null default '{}',
  position int not null default 0, enabled boolean not null default true
);
create table public.site_settings (key text primary key, value jsonb not null);
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id),
  action text not null, target_type text, target_id text, note text,
  created_at timestamptz not null default now()
);

-- ═══════════════════════ Row Level Security ═══════════════════════
do $$ declare t text; begin
  foreach t in array array['profiles','subscriptions','payments','payment_errors','categories','content','content_links',
    'content_chapters','content_resources','playlists','playlist_items','watch_progress','likes','saved','views','comments',
    'comment_likes','comment_reports','banned_words','notifications','home_sections','site_settings','admin_audit_log']
  loop execute format('alter table public.%I enable row level security', t);
       execute format('create policy admin_all on public.%I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- profiles: everyone reads display info (comment authors); users edit their own, never role/ban
create policy profiles_read on public.profiles for select using (true);
create policy profiles_update_self on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()) and is_banned = (select is_banned from profiles where id = auth.uid()));

-- subscriptions / payments: read own only. Writes happen via service role (webhook) or admin.
create policy subs_read_own on public.subscriptions for select using (user_id = auth.uid());
create policy payments_read_own on public.payments for select using (user_id = auth.uid());

-- content metadata: published + live rows readable by everyone (members content included — it sells itself).
-- Drafts/scheduled are admin-only via admin_all.
create policy content_read_live on public.content for select
  using (deleted_at is null and media_status = 'ready' and status = 'published' and published_at <= now());
create policy links_read on public.content_links for select using (public.content_visible(content_id));
create policy chapters_read on public.content_chapters for select using (public.content_visible(content_id));
-- resource metadata readable; the file itself is a private bucket served by signed URL to members only
create policy resources_read on public.content_resources for select using (public.content_visible(content_id));
create policy categories_read on public.categories for select using (true);
create policy playlists_read on public.playlists for select using (true);
create policy playlist_items_read on public.playlist_items for select using (true);
create policy home_read on public.home_sections for select using (true);
create policy settings_read on public.site_settings for select using (true);
create policy banned_words_none on public.banned_words for select using (public.is_admin());

-- personal data
create policy progress_own on public.watch_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy likes_own on public.likes for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_active_user() and public.can_engage(content_id));
create policy saved_own on public.saved for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_active_user() and public.can_engage(content_id));
create policy notifications_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- comments: anyone reads visible comments; members-only clips accept comments from members only
create policy comments_read on public.comments for select using (deleted_at is null and not is_hidden);
create policy comments_insert on public.comments for insert with check (
  user_id = auth.uid() and public.is_active_user() and public.can_comment(content_id));
-- owner may edit body / soft-delete only their own; column-level rules live in comments_guard_update
create policy comments_update_own on public.comments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy comment_likes_own on public.comment_likes for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_active_user());
create policy reports_insert on public.comment_reports for insert with check (user_id = auth.uid());

-- ═══════════════════════ Payment webhook logic ═══════════════════════
-- Called by /api/webhooks/payment with the service role after HMAC verification.
create or replace function public.apply_payment(
  p_user_id uuid, p_amount numeric, p_currency text, p_months int, p_method text, p_reference text, p_paid_at timestamptz, p_raw jsonb
) returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_exp timestamptz;
begin
  -- idempotent on reference
  if exists (select 1 from payments where reference = p_reference) then
    select expires_at into v_exp from subscriptions s join payments p on p.user_id = s.user_id where p.reference = p_reference;
    return v_exp;
  end if;
  insert into payments (user_id, amount, currency, months, method, reference, paid_at, raw)
    values (p_user_id, p_amount, p_currency, p_months, p_method, p_reference, p_paid_at, p_raw);
  insert into subscriptions (user_id) values (p_user_id) on conflict do nothing;
  -- paying early never loses days
  update subscriptions
     set expires_at = greatest(now(), coalesce(expires_at, now())) + make_interval(days => 30 * p_months),
         first_paid_at = coalesce(first_paid_at, p_paid_at), updated_at = now()
   where user_id = p_user_id returning expires_at into v_exp;
  insert into notifications (user_id, type, title, body, link)
    values (p_user_id, 'payment', 'ชำระเงินสำเร็จ', 'สมาชิกถึงวันที่ ' || to_char(v_exp at time zone 'Asia/Bangkok', 'DD/MM/YYYY'), '/account');
  return v_exp;
end $$;
revoke all on function public.apply_payment from public, anon, authenticated;

-- ═══════════════════════ Scheduler (pg_cron) ═══════════════════════
create or replace function public.publish_due() returns void language plpgsql security definer set search_path = public as $$
begin
  with due as (
    update content set status = 'published', published_at = scheduled_at, updated_at = now()
     where status = 'scheduled' and scheduled_at <= now() and media_status = 'ready' and deleted_at is null
     returning id, title, type, thumbnail_url
  )
  insert into notifications (user_id, type, title, body, link, image_url)
  select p.id, 'new_content', 'คลิปใหม่จาก TOPJ_GRIND', d.title,
         case d.type when 'short' then '/shorts/' when 'podcast' then '/podcasts/' else '/watch/' end || d.id, d.thumbnail_url
    from due d cross join profiles p where p.role <> 'admin';
end $$;

create or replace function public.expiry_reminders() returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, title, body, link)
  select user_id, 'expiring', 'สมาชิกใกล้หมดอายุ',
         'สมาชิกของคุณจะหมดอายุใน ' || ceil(extract(epoch from expires_at - now()) / 86400)::int || ' วัน', '/membership'
    from subscriptions where expires_at > now() and expires_at <= now() + interval '3 days';
$$;

select cron.schedule('publish-due', '* * * * *', 'select public.publish_due()');
select cron.schedule('purge-trash', '30 3 * * *', $$delete from public.content where deleted_at < now() - interval '30 days'$$);
select cron.schedule('expiry-reminders', '0 2 * * *', 'select public.expiry_reminders()'); -- 09:00 Asia/Bangkok

-- ═══════════════════════ Storage ═══════════════════════
insert into storage.buckets (id, name, public) values ('thumbnails', 'thumbnails', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('resources', 'resources', false) on conflict do nothing;
create policy thumbs_admin_write on storage.objects for all using (bucket_id = 'thumbnails' and public.is_admin()) with check (bucket_id = 'thumbnails' and public.is_admin());
create policy resources_admin_write on storage.objects for all using (bucket_id = 'resources' and public.is_admin()) with check (bucket_id = 'resources' and public.is_admin());
-- no select policy on 'resources': downloads only via server-generated signed URLs (10 min) for members

-- ═══════════════════════ Grants ═══════════════════════
-- "Automatically expose new tables" is OFF in this project, so every privilege is explicit.
-- RLS above decides WHICH rows; these decide which tables/columns a role may touch at all.
grant usage on schema public to anon, authenticated;

-- Public catalogue (guests can browse; members-only media still needs /api/play)
grant select on public.profiles, public.categories, public.content_links, public.content_chapters,
  public.content_resources, public.playlists, public.playlist_items, public.home_sections,
  public.site_settings, public.comments
  to anon, authenticated;
grant select on public.content_public to anon, authenticated;

-- Signed-in users: their own rows (RLS restricts to user_id = auth.uid())
grant select on public.subscriptions, public.payments, public.notifications to authenticated;
grant update (display_name, avatar_url, autoplay, theme, save_history) on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.watch_progress to authenticated;
grant select, insert, delete on public.likes, public.saved, public.comment_likes to authenticated;
grant insert on public.comments to authenticated;
grant update (body, deleted_at) on public.comments to authenticated;
grant insert on public.comment_reports to authenticated;

-- Admin (JR) works through the same role; RLS admin_all limits these rows to role = 'admin'
grant select, insert, update, delete on public.categories, public.content_links, public.content_chapters,
  public.content_resources, public.playlists, public.playlist_items, public.home_sections, public.site_settings,
  public.banned_words, public.comment_reports, public.payment_errors, public.admin_audit_log, public.views
  to authenticated;
grant update (is_pinned, creator_hearted, is_hidden) on public.comments to authenticated;
grant update (role, is_banned) on public.profiles to authenticated;
grant insert, update on public.subscriptions to authenticated;
grant insert, update, delete on public.content to authenticated;

-- Column-level guard on content: only the server (service role) can read media locations
-- (bunny_video_id, audio_path, captions_path).
grant select (id, type, title, description, thumbnail_url, preview_url, duration_sec, width, height, visibility, status,
  media_status, publish_when_ready, published_at, scheduled_at, category_id, tags, comments_enabled, linked_content_id,
  linked_start_sec, has_captions, view_count, like_count, comment_count, search_vector, deleted_at, created_at, updated_at)
  on public.content to anon, authenticated;

-- Helpers used inside policies
grant execute on function public.is_admin(), public.is_member(), public.is_active_user(),
  public.content_visible(uuid), public.can_engage(uuid), public.can_comment(uuid) to anon, authenticated;
revoke all on function public.publish_due(), public.expiry_reminders(), public.handle_new_user() from public, anon, authenticated;
