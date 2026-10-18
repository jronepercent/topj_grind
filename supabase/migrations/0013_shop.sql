-- 0013 — Shop (ร้านค้า): products sold one-off, separate from membership.
--   products   what is for sale. digital now (e-book / course / template / file), physical is in the schema but has no UI yet.
--   purchases  who owns what. A paid purchase is the ONLY thing that grants a download / unlocks a course.
-- Reads of products go through the server (service role) with an explicit column list — `file_path` (the object in the
-- private `products` bucket) must never reach a browser, so anon / authenticated get NO grant on `products` at all.
-- purchases can be read by their owner (RLS) and are written only by the service-role function apply_purchase().
-- Idempotent where practical: safe to run twice. Image columns hold URLs only (see 0007) — never data: URLs.

-- ═══════════════════════ Tables ═══════════════════════
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'digital' check (kind in ('digital', 'physical')),
  product_type text not null default 'ebook' check (product_type in ('ebook', 'course', 'template', 'file', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  subtitle text check (subtitle is null or char_length(subtitle) <= 300),
  description text not null default '' check (char_length(description) <= 20000),
  cover_url text,
  images text[] not null default '{}',
  price_thb numeric(10,2) not null check (price_thb > 0),
  compare_at_thb numeric(10,2),
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_featured boolean not null default false,
  position int not null default 0,
  -- digital delivery: the object lives in the private `products` bucket; file_name is the name the buyer downloads as
  file_path text,
  file_name text check (file_name is null or char_length(file_name) <= 255),
  file_size bigint check (file_size is null or file_size >= 0),
  -- a course product unlocks this playlist's members-only items for its buyers
  course_playlist_id uuid references public.playlists(id) on delete set null,
  -- physical goods (not used yet)
  stock int check (stock is null or stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint products_images_max check (cardinality(images) <= 10),
  constraint products_images_urls check (public.image_urls_ok(images)),
  constraint products_cover_not_inline check (cover_url is null or cover_url not ilike 'data:%'),
  constraint products_compare_at check (compare_at_thb is null or compare_at_thb > price_thb),
  constraint products_file_pair check ((file_path is null) = (file_name is null))
);
create index if not exists products_shop_idx on public.products (is_featured desc, position, created_at desc) where deleted_at is null and status = 'published';
create index if not exists products_playlist_idx on public.products (course_playlist_id) where course_playlist_id is not null;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- products are soft-deleted (deleted_at); a product with purchases can never be hard-deleted
  product_id uuid not null references public.products(id) on delete restrict,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'THB',
  method text not null check (method in ('card', 'promptpay', 'slip', 'apple_pay', 'google_pay', 'manual')),
  reference text not null unique,
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  paid_at timestamptz not null default now(),
  raw jsonb,
  created_at timestamptz not null default now()
);
-- one paid copy per person per product (a refunded row does not block buying again)
create unique index if not exists purchases_one_paid_idx on public.purchases (user_id, product_id) where status = 'paid';
create index if not exists purchases_user_idx on public.purchases (user_id, paid_at desc);
create index if not exists purchases_product_idx on public.purchases (product_id) where status = 'paid';

-- ═══════════════════════ RLS ═══════════════════════
alter table public.products enable row level security;
alter table public.purchases enable row level security;

-- products: admin only. There is deliberately no public policy — the server reads the catalogue with explicit columns.
drop policy if exists admin_all on public.products;
create policy admin_all on public.products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.purchases;
create policy admin_all on public.purchases for all using (public.is_admin()) with check (public.is_admin());
-- buyers see their own purchases; nobody inserts / updates from a browser (apply_purchase() does, as the service role)
drop policy if exists purchases_read_own on public.purchases;
create policy purchases_read_own on public.purchases for select using (user_id = auth.uid());

-- ═══════════════════════ apply_purchase ═══════════════════════
-- Atomic + idempotent on reference. Browsers can never call it (service role only, like apply_payment in 0010).
--   p_manual = false (a real payment): the amount must equal the product price, in THB.
--   p_manual = true  (JR grants access from Studio): the amount is whatever JR records (usually 0).
-- Returns the purchase id (the existing one on a replay).
create or replace function public.apply_purchase(
  p_user_id uuid, p_product_id uuid, p_amount numeric, p_currency text, p_method text, p_reference text,
  p_paid_at timestamptz, p_raw jsonb, p_manual boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_prod public.products%rowtype;
  v_id uuid;
begin
  -- replay of the same payment
  select id into v_id from purchases where reference = p_reference;
  if found then return v_id; end if;

  select * into v_prod from products where id = p_product_id and deleted_at is null;
  if not found then
    raise exception 'apply_purchase: product not found' using errcode = 'P0002';
  end if;
  if not p_manual and (coalesce(upper(p_currency), 'THB') <> 'THB' or abs(p_amount - v_prod.price_thb) > 0.005) then
    raise exception 'apply_purchase: amount mismatch' using errcode = '22023';
  end if;

  insert into purchases (user_id, product_id, amount, currency, method, reference, status, paid_at, raw)
    values (p_user_id, p_product_id, p_amount, coalesce(p_currency, 'THB'), p_method, p_reference, 'paid',
            coalesce(p_paid_at, now()), p_raw)
    on conflict do nothing
    returning id into v_id;

  if v_id is null then
    -- lost a race on the reference, or the customer already owns it under another reference
    select id into v_id from purchases where reference = p_reference;
    if v_id is not null then return v_id; end if;
    select id into v_id from purchases where user_id = p_user_id and product_id = p_product_id and status = 'paid';
    if not p_manual then
      insert into payment_errors (payload, reason)
        values (p_raw, 'ซื้อซ้ำ: ลูกค้ามีสินค้านี้อยู่แล้ว (' || v_prod.title || ') อาจต้องคืนเงิน อ้างอิง ' || p_reference);
    end if;
    return v_id;
  end if;

  insert into notifications (user_id, type, title, body, link)
    values (p_user_id, 'payment', 'ซื้อสำเร็จ', v_prod.title, '/library?tab=purchases');
  return v_id;
end $$;

revoke all on function public.apply_purchase(uuid, uuid, numeric, text, text, text, timestamptz, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.apply_purchase(uuid, uuid, numeric, text, text, text, timestamptz, jsonb, boolean) to service_role;

-- ═══════════════════════ Grants ═══════════════════════
-- "Automatically expose new tables" is OFF in this project (see 0001), so every privilege is explicit.
-- products: NO anon / authenticated grant on purpose (file_path stays server-side).
grant select on public.purchases to authenticated;
grant all on public.products, public.purchases to service_role;

-- ═══════════════════════ Storage: private bucket for the files customers buy ═══════════════════════
-- Up to 2 GB per file (a bucket limit can never exceed the project-wide "Upload file size limit" in the dashboard).
insert into storage.buckets (id, name, public, file_size_limit)
values ('products', 'products', false, 2147483648)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = null;

-- Only admins touch objects through the browser (resumable upload runs as the signed-in admin).
-- Buyers never get a select policy: they receive a 60-second server-signed URL from /api/shop/download/[productId].
drop policy if exists products_admin_write on storage.objects;
create policy products_admin_write on storage.objects for all
  using (bucket_id = 'products' and public.is_admin())
  with check (bucket_id = 'products' and public.is_admin());
