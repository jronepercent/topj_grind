-- 0015 — Email notifications ("ส่งอีเมลแจ้งเตือน" from Studio).
--   profiles.email_updates   opt-out switch (default on). Members change it on /account; the unsubscribe link in each email clears it.
--   email_broadcasts         one row per send: which item, which audience, how many sent / failed. Admin only.
--   email_recipients()       who would receive a send. Service role only — it reads auth.users, so browsers must never call it.
--   email_recipient_counts() the same two lists, counted (shown in the send dialog).
-- Idempotent where practical: safe to run twice.

-- ═══════════════════════ Opt-out switch ═══════════════════════
alter table public.profiles add column if not exists email_updates boolean not null default true;
-- Same column-level grant as save_history / theme: a user can change only their own row (profiles_update_self, RLS).
grant update (display_name, avatar_url, autoplay, theme, save_history, email_updates) on public.profiles to authenticated;

-- ═══════════════════════ Broadcast log ═══════════════════════
create table if not exists public.email_broadcasts (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('content', 'post', 'article')),
  source_id uuid not null,
  audience text not null check (audience in ('all', 'members')),
  subject text not null check (char_length(subject) between 1 and 150),
  recipients int not null default 0 check (recipients >= 0),
  sent int not null default 0 check (sent >= 0),
  failed int not null default 0 check (failed >= 0),
  error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists email_broadcasts_source_idx on public.email_broadcasts (source_type, source_id, created_at desc);

alter table public.email_broadcasts enable row level security;
drop policy if exists admin_all on public.email_broadcasts;
create policy admin_all on public.email_broadcasts for all using (public.is_admin()) with check (public.is_admin());
-- The server writes with the service role; no grant to anon / authenticated on purpose.
grant all on public.email_broadcasts to service_role;

-- ═══════════════════════ Recipients (service role only) ═══════════════════════
-- Confirmed accounts that are not banned and have not opted out. 'members' also needs an active subscription (expires_at > now()).
create or replace function public.email_recipients(p_audience text)
returns table (user_id uuid, email text, display_name text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, coalesce(nullif(btrim(p.display_name), ''), split_part(u.email::text, '@', 1))
    from auth.users u
    join public.profiles p on p.id = u.id
   where u.email_confirmed_at is not null
     and u.email is not null and u.email <> ''
     and not p.is_banned
     and p.email_updates
     and (p_audience = 'all'
          or (p_audience = 'members' and exists (
                select 1 from public.subscriptions s where s.user_id = u.id and s.expires_at > now())))
   order by u.id;
$$;

create or replace function public.email_recipient_counts()
returns table (all_count int, members_count int)
language sql stable security definer set search_path = public, auth as $$
  select count(*)::int,
         (count(*) filter (where exists (
            select 1 from public.subscriptions s where s.user_id = u.id and s.expires_at > now())))::int
    from auth.users u
    join public.profiles p on p.id = u.id
   where u.email_confirmed_at is not null
     and u.email is not null and u.email <> ''
     and not p.is_banned
     and p.email_updates;
$$;

revoke all on function public.email_recipients(text) from public, anon, authenticated;
revoke all on function public.email_recipient_counts() from public, anon, authenticated;
grant execute on function public.email_recipients(text), public.email_recipient_counts() to service_role;
