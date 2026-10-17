-- The comment guard triggers protect against browsers. The server (service role, after its own
-- checks: JR's moderation, seeding) and direct database maintenance must be able to set
-- pins, hearts, counters and timestamps.
create or replace function public.is_trusted_backend() returns boolean
language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin');
$$;

create or replace function public.comments_one_level() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and not public.is_trusted_backend() then
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

create or replace function public.comments_guard_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or public.is_trusted_backend() or pg_trigger_depth() > 1 then return new; end if;
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

-- Seed bookkeeping: which rows `npm run db:seed` created, so `--remove` can take them out again.
create table if not exists app_private.seed_rows (tbl text not null, id text not null, primary key (tbl, id));
