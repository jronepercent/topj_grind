-- Home: a "ของฟรี" row (published freebies, pinned first) that Studio can rename, switch on/off and reorder like the other automatic rows.
-- 1) allow the new section type 'freebies'
-- 2) add one row right after 'products' (rows below it shift down by one so positions stay unique), unless it already exists.
-- Idempotent: running it twice leaves the same rows.

alter table public.home_sections drop constraint if exists home_sections_type_check;
alter table public.home_sections
  add constraint home_sections_type_check
  check (type in ('hero','continue','latest','products','freebies','videos','articles','podcasts','playlists','all','custom'));

do $$
declare
  pos int;
begin
  if not exists (select 1 from public.home_sections where type = 'freebies') then
    select coalesce(min(position), 3) into pos from public.home_sections where type = 'products';
    update public.home_sections set position = position + 1 where position >= pos + 1;
    insert into public.home_sections (type, title, content_ids, position, enabled)
    values ('freebies', 'ของฟรี', '{}', pos + 1, true);
  end if;
end $$;
