-- 0011 — Community (ชุมชน) + Articles (บทความ).
-- Replaces the Shorts section. One `posts` table holds both kinds:
--   kind = 'community'  Instagram-style post (caption + up to 10 images), readable by signed-in users, posted by members.
--   kind = 'article'    Markdown article written by JR (admin only), public or members-only.
-- Comments and likes are shared. Image columns hold URLs only (see 0007) — never data: URLs.
-- Idempotent where practical: safe to run twice.

-- ═══════════════════════ Helpers ═══════════════════════
-- Every element must be an http(s) URL (no data: URLs, no relative junk).
create or replace function public.image_urls_ok(urls text[]) returns boolean
language sql immutable as $$
  select not exists (select 1 from unnest(urls) u where u is null or u !~* '^https?://' or u ilike 'data:%');
$$;

-- ═══════════════════════ Tables ═══════════════════════
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('community', 'article')),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text check (title is null or char_length(title) <= 200),
  body text not null default '',
  excerpt text check (excerpt is null or char_length(excerpt) <= 400),
  cover_url text,
  read_min int not null default 1 check (read_min between 1 and 999),
  images text[] not null default '{}',
  visibility text not null default 'public' check (visibility in ('public', 'members')),
  status text not null default 'published' check (status in ('draft', 'published')),
  is_pinned boolean not null default false,
  is_hidden boolean not null default false,
  like_count int not null default 0,
  comment_count int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint posts_article_title check (kind <> 'article' or char_length(btrim(coalesce(title, ''))) > 0),
  constraint posts_body_len check (char_length(body) <= case kind when 'article' then 60000 else 3000 end),
  constraint posts_images_max check (cardinality(images) <= 10),
  constraint posts_images_urls check (public.image_urls_ok(images)),
  constraint posts_cover_not_inline check (cover_url is null or cover_url not ilike 'data:%'),
  constraint posts_community_has_content check (kind <> 'community' or char_length(btrim(body)) > 0 or cardinality(images) > 0),
  constraint posts_community_always_open check (kind <> 'community' or (visibility = 'public' and status = 'published'))
);

create index if not exists posts_feed_idx on public.posts (kind, published_at desc) where deleted_at is null;
create index if not exists posts_pinned_idx on public.posts (kind, is_pinned) where deleted_at is null and is_pinned;
create index if not exists posts_author_idx on public.posts (author_id);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_user_idx on public.post_likes (user_id, post_id);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.post_comments(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  is_hidden boolean not null default false,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at desc);
create index if not exists post_comments_parent_idx on public.post_comments (parent_id) where parent_id is not null;

-- ═══════════════════════ Access helpers (security definer, so RLS can look across tables) ═══════════════════════
-- Can the current user read this post? Community: any active signed-in user. Article: public, or members.
create or replace function public.can_read_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from posts p
     where p.id = pid and p.deleted_at is null and p.status = 'published' and not p.is_hidden
       and p.published_at is not null and p.published_at <= now()
       and (case when p.kind = 'community' then public.is_active_user()
                 else (p.visibility = 'public' or public.is_member()) end)
  );
$$;

-- Comments: members only (admins count as members), not banned, on a post they can read.
create or replace function public.can_comment_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and public.is_active_user() and public.can_read_post(pid);
$$;

-- ═══════════════════════ Triggers ═══════════════════════
-- Browsers cannot choose counters / pins / status; the service role and admins can.
create or replace function public.posts_guard_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() and not public.is_trusted_backend() then
      new.kind := 'community'; new.title := null; new.excerpt := null; new.cover_url := null;
      new.visibility := 'public'; new.status := 'published';
      new.is_pinned := false; new.is_hidden := false; new.like_count := 0; new.comment_count := 0;
      new.deleted_at := null; new.created_at := now(); new.published_at := now();
      if exists (select 1 from banned_words w where position(lower(w.word) in lower(new.body)) > 0) then
        raise exception 'post contains a banned word' using errcode = '22023';
      end if;
    end if;
    if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  else
    if not public.is_admin() and not public.is_trusted_backend() and pg_trigger_depth() <= 1 then
      if new.kind is distinct from old.kind or new.author_id is distinct from old.author_id
         or new.title is distinct from old.title or new.excerpt is distinct from old.excerpt
         or new.cover_url is distinct from old.cover_url or new.visibility is distinct from old.visibility
         or new.status is distinct from old.status or new.is_pinned is distinct from old.is_pinned
         or new.is_hidden is distinct from old.is_hidden or new.like_count is distinct from old.like_count
         or new.comment_count is distinct from old.comment_count or new.published_at is distinct from old.published_at
         or new.created_at is distinct from old.created_at
         or (old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at) then
        raise exception 'not allowed to change these post fields' using errcode = '42501';
      end if;
      if new.body is distinct from old.body
         and exists (select 1 from banned_words w where position(lower(w.word) in lower(new.body)) > 0) then
        raise exception 'post contains a banned word' using errcode = '22023';
      end if;
    end if;
    if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
    if pg_trigger_depth() <= 1 then new.updated_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists posts_guard on public.posts;
create trigger posts_guard before insert or update on public.posts for each row execute function public.posts_guard_write();

create or replace function public.bump_post_likes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update posts set like_count = greatest(0, like_count + case when tg_op = 'INSERT' then 1 else -1 end)
   where id = coalesce(new.post_id, old.post_id);
  return null;
end $$;
drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count after insert or delete on public.post_likes for each row execute function public.bump_post_likes();

create or replace function public.bump_post_comment_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif old.deleted_at is null and new.deleted_at is not null then
    update posts set comment_count = greatest(0, comment_count - 1) where id = new.post_id;
  end if;
  return null;
end $$;
drop trigger if exists post_comments_count on public.post_comments;
create trigger post_comments_count after insert or update of deleted_at on public.post_comments
  for each row execute function public.bump_post_comment_count();

-- Comment guards: one level of replies, same post, banned words; browsers cannot touch moderation fields.
create or replace function public.post_comments_guard_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() and not public.is_trusted_backend() then
      new.is_hidden := false; new.edited_at := null; new.deleted_at := null; new.created_at := now();
      if exists (select 1 from banned_words w where position(lower(w.word) in lower(new.body)) > 0) then
        raise exception 'comment contains a banned word' using errcode = '22023';
      end if;
    end if;
    if new.parent_id is not null and not exists (
      select 1 from post_comments c where c.id = new.parent_id and c.post_id = new.post_id and c.parent_id is null
    ) then
      raise exception 'replies can only be one level deep, on the same post';
    end if;
  else
    if not public.is_admin() and not public.is_trusted_backend() and pg_trigger_depth() <= 1 then
      if new.post_id is distinct from old.post_id or new.parent_id is distinct from old.parent_id
         or new.user_id is distinct from old.user_id or new.is_hidden is distinct from old.is_hidden
         or new.created_at is distinct from old.created_at
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
    end if;
  end if;
  return new;
end $$;
drop trigger if exists post_comments_guard on public.post_comments;
create trigger post_comments_guard before insert or update on public.post_comments
  for each row execute function public.post_comments_guard_write();

-- ═══════════════════════ Row Level Security ═══════════════════════
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

drop policy if exists admin_all on public.posts;
create policy admin_all on public.posts for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all on public.post_likes;
create policy admin_all on public.post_likes for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all on public.post_comments;
create policy admin_all on public.post_comments for all using (public.is_admin()) with check (public.is_admin());

-- posts: articles — published, visible, public or members; community — any active signed-in user.
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (
  deleted_at is null and status = 'published' and not is_hidden and published_at <= now()
  and (case when kind = 'community' then public.is_active_user()
            else (visibility = 'public' or public.is_member()) end)
);
-- authors can always see their own community posts (so soft-delete / edit works)
drop policy if exists posts_read_own on public.posts;
create policy posts_read_own on public.posts for select using (author_id = auth.uid() and kind = 'community');
-- members (not banned) post community content as themselves; articles are admin-only (admin_all)
drop policy if exists posts_insert_member on public.posts;
create policy posts_insert_member on public.posts for insert with check (
  kind = 'community' and author_id = auth.uid() and public.is_member() and public.is_active_user());
-- authors edit / soft-delete their own community posts; posts_guard_write blocks moderation columns
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts for update
  using (author_id = auth.uid() and kind = 'community' and public.is_active_user())
  with check (author_id = auth.uid() and kind = 'community');

-- likes: see your own; like anything you can read
drop policy if exists post_likes_read_own on public.post_likes;
create policy post_likes_read_own on public.post_likes for select using (user_id = auth.uid());
drop policy if exists post_likes_insert on public.post_likes;
create policy post_likes_insert on public.post_likes for insert
  with check (user_id = auth.uid() and public.is_active_user() and public.can_read_post(post_id));
drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes for delete using (user_id = auth.uid());

-- comments: readable wherever the post is readable; members comment; owners edit / soft-delete their own
drop policy if exists post_comments_read on public.post_comments;
create policy post_comments_read on public.post_comments for select
  using (deleted_at is null and not is_hidden and public.can_read_post(post_id));
-- authors always see their own rows: an UPDATE's new row must pass a SELECT policy too, so without this
-- the soft-delete (deleted_at = now()) of your own comment would be rejected
drop policy if exists post_comments_read_own on public.post_comments;
create policy post_comments_read_own on public.post_comments for select using (user_id = auth.uid());
drop policy if exists post_comments_insert on public.post_comments;
create policy post_comments_insert on public.post_comments for insert
  with check (user_id = auth.uid() and public.can_comment_post(post_id));
drop policy if exists post_comments_update_own on public.post_comments;
create policy post_comments_update_own on public.post_comments for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ═══════════════════════ Grants ═══════════════════════
-- "Automatically expose new tables" is OFF in this project (see 0001), so every privilege is explicit.
-- RLS above decides WHICH rows; these decide which tables a role may touch at all.
-- Public articles are readable without signing in; everything else the policies restrict further.
grant select on public.posts, public.post_comments to anon, authenticated;
-- Signed-in users: post / comment / edit / soft-delete (policies + guard triggers narrow it); JR also deletes
grant insert, update, delete on public.posts, public.post_comments to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant execute on function public.can_read_post(uuid), public.can_comment_post(uuid), public.image_urls_ok(text[]) to anon, authenticated;

-- Trusted backend (service role, see 0006)
grant all on public.posts, public.post_likes, public.post_comments to service_role;
grant execute on function public.can_read_post(uuid), public.can_comment_post(uuid), public.image_urls_ok(text[]) to service_role;
