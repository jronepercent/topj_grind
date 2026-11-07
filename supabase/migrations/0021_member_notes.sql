-- 0021 — Team notes on a member (Studio → สมาชิก → profile → โน้ตของทีม).
--   member_notes   free-text notes about one member, written by an admin (author kept for the trail; set null if the admin is removed).
-- Admin-only: RLS allows is_admin() only; browsers get no grant. The server reads/writes with the service role.
-- Idempotent: safe to run twice.

create table if not exists public.member_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists member_notes_user_idx on public.member_notes (user_id, created_at desc);

alter table public.member_notes enable row level security;
drop policy if exists admin_all on public.member_notes;
create policy admin_all on public.member_notes for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.member_notes from anon, authenticated;
grant all on public.member_notes to service_role;
