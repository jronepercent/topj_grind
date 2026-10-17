-- Home Hero slides that JR edits in Studio. A slide can point at a clip (its title, cover and link
-- are the defaults) or stand alone as a banner with its own image, text and link. Each slide can have
-- a separate phone image and a start/end time. The hero row in home_sections keeps only the on/off switch.
create table public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  position int not null default 0,
  enabled boolean not null default true,
  content_id uuid references public.content(id) on delete set null,
  title text not null default '' check (char_length(title) <= 100),
  subtitle text not null default '' check (char_length(subtitle) <= 200),
  image_url text check (image_url is null or image_url not like 'data:%'),
  mobile_image_url text check (mobile_image_url is null or mobile_image_url not like 'data:%'),
  cta_label text not null default '' check (char_length(cta_label) <= 30),
  cta_href text not null default '' check (char_length(cta_href) <= 500),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index hero_slides_position_idx on public.hero_slides (position);

alter table public.hero_slides enable row level security;
create policy admin_all on public.hero_slides for all using (public.is_admin()) with check (public.is_admin());
create policy hero_read on public.hero_slides for select using (true);

grant select on public.hero_slides to anon, authenticated;
grant insert, update, delete on public.hero_slides to authenticated;
grant all on public.hero_slides to service_role;

-- Carry over the clips already picked for the Hero, in order.
insert into public.hero_slides (content_id, position)
select x.id, x.ord - 1
from public.home_sections h, unnest(h.content_ids) with ordinality as x(id, ord)
where h.type = 'hero' and exists (select 1 from public.content c where c.id = x.id);
update public.home_sections set content_ids = '{}' where type = 'hero';
