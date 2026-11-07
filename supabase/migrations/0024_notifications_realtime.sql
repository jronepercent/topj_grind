-- 0024 — Live notification bell.
-- Adds public.notifications to Supabase Realtime so the header bell gets INSERT / UPDATE events as they happen.
-- Realtime applies RLS: the existing `notifications_own` select policy (user_id = auth.uid()) means each signed-in
-- browser only receives its own rows. Idempotent: safe to run twice.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
