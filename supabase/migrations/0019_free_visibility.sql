-- 0019: third content visibility level "free" = free for anyone with an account.
-- Guests get a short preview in the player, then must sign in. Playlists stay public|members.
-- can_engage / can_comment: signed-in users may like/save/comment on free content (RLS callers are always signed in).

-- The 0001 check was inline (auto-named), so drop every check on content that mentions visibility, whatever its name.
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.content'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%visibility%'
  loop
    execute format('alter table public.content drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.content add constraint content_visibility_check check (visibility in ('public','free','members'));

create or replace function public.can_engage(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from content c where c.id = cid and public.content_is_live(c)
                 and (c.visibility in ('public','free') or public.is_member()));
$$;

create or replace function public.can_comment(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from content c where c.id = cid and public.content_is_live(c) and c.comments_enabled
                 and (c.visibility in ('public','free') or public.is_member()));
$$;
