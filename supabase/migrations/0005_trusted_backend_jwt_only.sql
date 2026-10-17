-- Fix for 0004: the guard triggers are SECURITY DEFINER, so inside them current_user is always the
-- owner (postgres) and every caller looked "trusted". Trust only the service-role JWT, which only
-- our server holds.
create or replace function public.is_trusted_backend() returns boolean
language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;
