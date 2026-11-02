-- 0016 — Free sample file for shop products (login required, no purchase needed).
--   products.sample_path / sample_name / sample_size   an optional free file (e.g. the first chapter as PDF). Same private `products`
--                                                       bucket as the paid file, under the separate prefix samples/<product id>/.
--   sample_downloads                                   one row per sample download (who, which product, when), so JR can see warm leads.
-- Like file_path in 0013, `sample_path` never reaches a browser: the server reads with an explicit column list and hands a signed URL
-- out of /api/shop/sample/[productId] — to signed-in users only (guests are redirected to sign up / log in first).
-- Idempotent where practical: safe to run twice.

-- ═══════════════════════ Sample file columns ═══════════════════════
alter table public.products add column if not exists sample_path text;
alter table public.products add column if not exists sample_name text;
alter table public.products add column if not exists sample_size bigint;

alter table public.products drop constraint if exists products_sample_name_len;
alter table public.products add constraint products_sample_name_len check (sample_name is null or char_length(sample_name) <= 255);
alter table public.products drop constraint if exists products_sample_size_ok;
alter table public.products add constraint products_sample_size_ok check (sample_size is null or sample_size >= 0);
alter table public.products drop constraint if exists products_sample_pair;
alter table public.products add constraint products_sample_pair check ((sample_path is null) = (sample_name is null));

-- ═══════════════════════ Sample download log ═══════════════════════
create table if not exists public.sample_downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists sample_downloads_product_idx on public.sample_downloads (product_id, created_at desc);

alter table public.sample_downloads enable row level security;
drop policy if exists admin_all on public.sample_downloads;
create policy admin_all on public.sample_downloads for all using (public.is_admin()) with check (public.is_admin());
-- Rows are written by the server with the service role; no grant to anon / authenticated on purpose.
grant all on public.sample_downloads to service_role;
