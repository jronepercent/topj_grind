-- 0020 — Onboarding question + welcome email sequence.
--   profiles.onboarding_stage   answer to "ตอนนี้คุณอยู่ตรงไหน": idea | build | sell (null = not answered / skipped)
--   profiles.onboarded_at       set when the person answered OR skipped (so the question is not asked again)
--   welcome_emails              one row per welcome email sent: step 0 (day 0), 1, 3, 7. Written by the server only.
--   welcome_due()               who should get which step now (smallest due step per person). Service role only — reads auth.users.
-- Starter-path clips live in site_settings key "onboarding" (edited in Studio → จัดหน้า Home); no table needed.
-- Idempotent where practical: safe to run twice.

-- ═══════════════════════ Profile columns ═══════════════════════
alter table public.profiles add column if not exists onboarding_stage text;
alter table public.profiles add column if not exists onboarded_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_onboarding_stage_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_onboarding_stage_check check (onboarding_stage is null or onboarding_stage in ('idea', 'build', 'sell'));
  end if;
end $$;
-- No column grant to authenticated on purpose: the server writes these with the service role after checking the viewer.

-- ═══════════════════════ Welcome email log ═══════════════════════
create table if not exists public.welcome_emails (
  user_id uuid not null references public.profiles(id) on delete cascade,
  step smallint not null check (step in (0, 1, 3, 7)),
  sent_at timestamptz not null default now(),
  primary key (user_id, step)
);

alter table public.welcome_emails enable row level security;
-- No policies: browsers can neither read nor write. The server uses the service role.
revoke all on public.welcome_emails from anon, authenticated;
grant all on public.welcome_emails to service_role;

-- ═══════════════════════ Who is due (service role only) ═══════════════════════
-- One row per person, for the smallest step that is due:
--   step 0  confirmed account created on/after the launch date and at least 1 hour ago, no step-0 row yet
--           (catch-up for people who never reached /welcome; people who answer get step 0 immediately from the server)
--   step k  (1, 3, 7) step-0 row exists, sent_at + k days has passed, no row for k yet
-- Always: confirmed email, not banned, has not opted out (email_updates). is_member = active subscription (expires_at > now()).
create or replace function public.welcome_due()
returns table (user_id uuid, email text, display_name text, stage text, is_member boolean, step smallint)
language sql stable security definer set search_path = public, auth as $$
  with base as (
    select u.id as uid,
           u.email::text as mail,
           u.created_at as created,
           coalesce(nullif(btrim(p.display_name), ''), split_part(u.email::text, '@', 1)) as dname,
           p.onboarding_stage as stg,
           exists (select 1 from public.subscriptions s where s.user_id = u.id and s.expires_at > now()) as member
      from auth.users u
      join public.profiles p on p.id = u.id
     where u.email_confirmed_at is not null
       and u.email is not null and u.email <> ''
       and not p.is_banned
       and p.email_updates
  ), due as (
    select b.*, 0::smallint as st
      from base b
     where b.created >= timestamptz '2026-11-07 00:00+07'
       and b.created <= now() - interval '1 hour'
       and not exists (select 1 from public.welcome_emails w where w.user_id = b.uid and w.step = 0)
    union all
    select b.*, k.st
      from base b
      join public.welcome_emails w0 on w0.user_id = b.uid and w0.step = 0
     cross join (values (1::smallint), (3::smallint), (7::smallint)) as k(st)
     where w0.sent_at + make_interval(days => k.st) <= now()
       and not exists (select 1 from public.welcome_emails w where w.user_id = b.uid and w.step = k.st)
  )
  select distinct on (d.uid) d.uid, d.mail, d.dname, d.stg, d.member, d.st
    from due d
   order by d.uid, d.st;
$$;

revoke all on function public.welcome_due() from public, anon, authenticated;
grant execute on function public.welcome_due() to service_role;
