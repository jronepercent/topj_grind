-- The server (service role) runs these after its own checks: payment webhook, cron, admin tools.
-- Browsers (anon / authenticated) still cannot call them.
grant execute on function
  public.apply_payment(uuid, numeric, text, int, text, text, timestamptz, jsonb),
  public.publish_due(),
  public.expiry_reminders(),
  public.user_id_by_email(text)
  to service_role;
