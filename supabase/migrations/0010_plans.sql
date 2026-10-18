-- Two membership plans: monthly (30 days) and yearly (365 days).
-- apply_payment() learns an exact period in days (p_days) and the plan code (p_plan).
--   p_days null  -> old behaviour: 30 days x p_months   (legacy webhook payloads keep working)
--   p_days given -> exactly that many days (yearly = 365, not 12 x 30 = 360)
-- The function stays security definer and service-role only, same as 0001 / 0003 / 0006.

-- Which plan a payment bought. Nullable: rows before this migration, and manual/legacy payments, have none.
alter table public.payments add column if not exists plan text;
alter table public.payments drop constraint if exists payments_plan_check;
alter table public.payments add constraint payments_plan_check check (plan is null or plan in ('monthly', 'yearly'));

-- The signature changes, so drop the old one first (otherwise both overloads would exist side by side).
drop function if exists public.apply_payment(uuid, numeric, text, int, text, text, timestamptz, jsonb);

create or replace function public.apply_payment(
  p_user_id uuid, p_amount numeric, p_currency text, p_months int, p_method text, p_reference text, p_paid_at timestamptz, p_raw jsonb,
  p_days int default null, p_plan text default null
) returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_exp timestamptz;
  v_days int;
begin
  if p_days is not null and (p_days < 1 or p_days > 3660) then
    raise exception 'apply_payment: p_days out of range' using errcode = '22023';
  end if;
  v_days := coalesce(p_days, 30 * p_months);

  -- idempotent on reference
  if exists (select 1 from payments where reference = p_reference) then
    select expires_at into v_exp from subscriptions s join payments p on p.user_id = s.user_id where p.reference = p_reference;
    return v_exp;
  end if;
  insert into payments (user_id, amount, currency, months, method, reference, paid_at, raw, plan)
    values (p_user_id, p_amount, p_currency, p_months, p_method, p_reference, p_paid_at, p_raw, p_plan);
  insert into subscriptions (user_id) values (p_user_id) on conflict do nothing;
  -- paying early never loses days
  update subscriptions
     set expires_at = greatest(now(), coalesce(expires_at, now())) + make_interval(days => v_days),
         first_paid_at = coalesce(first_paid_at, p_paid_at), updated_at = now()
   where user_id = p_user_id returning expires_at into v_exp;
  insert into notifications (user_id, type, title, body, link)
    values (p_user_id, 'payment', 'ชำระเงินสำเร็จ', 'สมาชิกถึงวันที่ ' || to_char(v_exp at time zone 'Asia/Bangkok', 'DD/MM/YYYY'), '/account');
  return v_exp;
end $$;

-- Browsers (anon / authenticated) must never call this; only the server's service role does.
revoke all on function public.apply_payment(uuid, numeric, text, int, text, text, timestamptz, jsonb, int, text) from public, anon, authenticated;
grant execute on function public.apply_payment(uuid, numeric, text, int, text, text, timestamptz, jsonb, int, text) to service_role;
