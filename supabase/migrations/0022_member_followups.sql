-- 0022 — "ทักแล้ว" log for the Studio follow-up list (สมาชิก → ต้องทำวันนี้).
--   member_followups   one row each time an admin marks a person as contacted for a follow-up group
--                      (hot = Lead ร้อน, sample = โหลดตัวอย่างแต่ยังไม่ซื้อ, expiring = ใกล้หมด, at_risk = จ่ายแล้วแต่หายไป, no_watch = สมัครแล้วไม่เคยดู).
--                      A person is hidden from that group for 7 days afterwards.
-- Admin-only: RLS allows is_admin() only; browsers get no grant. The server reads/writes with the service role.
-- Idempotent: safe to run twice.

create table if not exists public.member_followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('hot', 'sample', 'expiring', 'at_risk', 'no_watch')),
  admin_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists member_followups_user_kind_idx on public.member_followups (user_id, kind, created_at desc);

alter table public.member_followups enable row level security;
drop policy if exists admin_all on public.member_followups;
create policy admin_all on public.member_followups for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.member_followups from anon, authenticated;
grant all on public.member_followups to service_role;
