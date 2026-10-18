-- Home page rework: every topic is one horizontally scrolling row (mobile) in the owner's order:
--   ใหม่ล่าสุด · สินค้าแนะนำ · วิดีโอ · บทความ · พอดแคสต์ · Playlist และซีรีส์ · คอนเทนต์ทั้งหมด
-- 1) allow the new section types (and drop the retired 'shorts' type)
-- 2) replace the automatic rows with the new layout. Rows we keep as they are: 'hero' (on/off switch),
--    'continue' (ดูต่อจากที่ค้างไว้, keeps its on/off + title) and hand-picked 'custom' rows (moved just above 'all').
-- Idempotent: running it twice leaves the same rows.

-- Retired / replaced automatic rows go first so the new check constraint can be added.
delete from public.home_sections where type in ('shorts', 'latest', 'podcasts', 'playlists', 'products', 'videos', 'articles', 'all');

alter table public.home_sections drop constraint if exists home_sections_type_check;
alter table public.home_sections
  add constraint home_sections_type_check
  check (type in ('hero','continue','latest','products','videos','articles','podcasts','playlists','all','custom'));

-- Fixed positions: hero 0, continue 1, then the seven rows; custom rows fill in between playlists and all.
insert into public.home_sections (type, title, content_ids, position, enabled) values
  ('latest',    'ใหม่ล่าสุด',          '{}', 2, true),
  ('products',  'สินค้าแนะนำ',         '{}', 3, true),
  ('videos',    'วิดีโอ',               '{}', 4, true),
  ('articles',  'บทความ',              '{}', 5, true),
  ('podcasts',  'พอดแคสต์',            '{}', 6, true),
  ('playlists', 'Playlist และซีรีส์', '{}', 7, true),
  ('all',       'คอนเทนต์ทั้งหมด',      '{}', 1000, true);

-- continue row: make sure it exists and sits right under the hero (keep its title / enabled flag if present)
update public.home_sections set position = 1 where type = 'continue';
insert into public.home_sections (type, title, content_ids, position, enabled)
select 'continue', 'ดูต่อจากที่ค้างไว้', '{}', 1, true
where not exists (select 1 from public.home_sections where type = 'continue');

-- custom rows: keep their relative order, number them 8, 9, … (above 'all')
update public.home_sections h
set position = 7 + r.n
from (select id, row_number() over (order by position, id) as n from public.home_sections where type = 'custom') r
where h.id = r.id;
