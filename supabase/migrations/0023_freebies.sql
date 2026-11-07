-- 0023 — ของฟรี (/free): free digital files and tools, given away for a sign-in (lead capture).
--   freebies         what is given away. kind 'file' = a download from the private `products` bucket under free/<id>/,
--                    kind 'tool' = a link (an https URL or a same-site path such as /tools/price).
--   freebie_claims   one row each time a signed-in person takes one (download or open), so JR can see who is a warm lead.
-- Like products (0013), `file_path` never reaches a browser: the server reads with an explicit column list and hands out a
-- 60-second signed URL from /api/free/[id], to signed-in users only. anon / authenticated get NO grant on either table.
-- Idempotent where practical: safe to run twice. Image columns hold URLs only (see 0007) — never data: URLs.

create table if not exists public.freebies (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'file' check (kind in ('file', 'tool')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  subtitle text check (subtitle is null or char_length(subtitle) <= 300),
  description text not null default '' check (char_length(description) <= 20000),
  cover_url text,
  -- kind = 'file': the object in the private `products` bucket (free/<id>/…) and the name it downloads as
  file_path text,
  file_name text check (file_name is null or char_length(file_name) <= 255),
  file_size bigint check (file_size is null or file_size >= 0),
  -- kind = 'tool': where the button goes
  url text check (url is null or (char_length(url) <= 1000 and (url ~* '^https://\S+$' or url ~ '^/[^/\\]'))),
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint freebies_cover_not_inline check (cover_url is null or cover_url not ilike 'data:%'),
  constraint freebies_file_pair check ((file_path is null) = (file_name is null))
);
create index if not exists freebies_list_idx on public.freebies (is_featured desc, created_at desc) where deleted_at is null and status = 'published';

create table if not exists public.freebie_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  freebie_id uuid not null references public.freebies(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists freebie_claims_freebie_idx on public.freebie_claims (freebie_id, created_at desc);
create index if not exists freebie_claims_user_idx on public.freebie_claims (user_id, created_at desc);

alter table public.freebies enable row level security;
alter table public.freebie_claims enable row level security;
drop policy if exists admin_all on public.freebies;
create policy admin_all on public.freebies for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all on public.freebie_claims;
create policy admin_all on public.freebie_claims for all using (public.is_admin()) with check (public.is_admin());

-- The server reads and writes both tables with the service role; no grant to anon / authenticated on purpose.
revoke all on public.freebies, public.freebie_claims from anon, authenticated;
grant all on public.freebies, public.freebie_claims to service_role;
-- Files reuse the private `products` bucket and its admin-only write policy (0013); nothing to add in storage.
