-- 0018 — ชุมชน เปิดให้ทุกคนที่ล็อคอินพิมพ์คุยได้ (เหมือนคอมเมนต์ YouTube)
--   * any signed-in, not-banned user can write a community post (text) and comment / reply
--     on any post or article they can read (members-only articles still need a membership to read)
--   * attaching images to a community post stays a members-only perk
--   * members are told apart by a tenure badge in the app (subscriptions.first_paid_at), no schema change needed
-- Idempotent: safe to run twice.

-- Posts: drop the members-only insert policy, any active signed-in user may post as themselves.
drop policy if exists posts_insert_member on public.posts;
drop policy if exists posts_insert_user on public.posts;
create policy posts_insert_user on public.posts for insert with check (
  kind = 'community' and author_id = auth.uid() and public.is_active_user());

-- Comments: anyone active who can read the post.
create or replace function public.can_comment_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and public.can_read_post(pid);
$$;

-- Same guard as 0011, plus: images on community posts need a membership (insert and edit).
create or replace function public.posts_guard_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() and not public.is_trusted_backend() then
      new.kind := 'community'; new.title := null; new.excerpt := null; new.cover_url := null;
      new.visibility := 'public'; new.status := 'published';
      new.is_pinned := false; new.is_hidden := false; new.like_count := 0; new.comment_count := 0;
      new.deleted_at := null; new.created_at := now(); new.published_at := now();
      if cardinality(new.images) > 0 and not public.is_member() then
        raise exception 'only members can attach images' using errcode = '42501';
      end if;
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
      if new.images is distinct from old.images and cardinality(new.images) > 0 and not public.is_member() then
        raise exception 'only members can attach images' using errcode = '42501';
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
