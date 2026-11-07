-- Site tour ("อะไรอยู่ตรงไหน"): remember that a person has seen it, so it auto-starts once per account, not once per device.
--   profiles.toured_at   set when the person finished OR skipped the tour (null = never seen)
-- The tour can always be replayed from the account menu or /about; replaying never clears this.
-- Idempotent.

alter table public.profiles add column if not exists toured_at timestamptz;
