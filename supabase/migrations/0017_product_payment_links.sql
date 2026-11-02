-- 0017 — Per-product Kohort payment link + how a Kohort payment is matched back to its product.
--   products.payment_url      the product's own Kohort payment link (https://kohort.me/pay/<shop>/<slug>). Checkout sends the buyer here
--                             (env PAYMENT_URL is only the fallback). Read on the server only, with an explicit column list.
--   products.kohort_name      the product's name as typed on Kohort. Kohort's webhook never carries OUR product id, so the name
--                             (or, once learned, the link id below) is how a payment finds its product. Empty = the title is used.
--   products.kohort_link_id   Kohort's internal uuid of the payment link (payload `link_id`; it is NOT in the link's URL). Learned
--                             automatically from the first payment that matched by name. Stored lower-cased and unique.
-- Like file_path in 0013, none of these reach a browser: anon / authenticated have no grant on `products`.
-- Idempotent where practical: safe to run twice.

-- ═══════════════════════ Columns ═══════════════════════
alter table public.products add column if not exists payment_url text;
alter table public.products add column if not exists kohort_name text;
alter table public.products add column if not exists kohort_link_id text;

alter table public.products drop constraint if exists products_payment_url_ok;
alter table public.products add constraint products_payment_url_ok
  check (payment_url is null or (payment_url ilike 'https://%' and char_length(payment_url) <= 500));
alter table public.products drop constraint if exists products_kohort_name_len;
alter table public.products add constraint products_kohort_name_len check (kohort_name is null or char_length(kohort_name) <= 200);
alter table public.products drop constraint if exists products_kohort_link_id_len;
alter table public.products add constraint products_kohort_link_id_len check (kohort_link_id is null or char_length(kohort_link_id) <= 100);

-- One Kohort link belongs to one product (case-insensitive, so a differently-cased uuid can't slip in a duplicate).
create unique index if not exists products_kohort_link_id_uidx on public.products (lower(kohort_link_id)) where kohort_link_id is not null;
