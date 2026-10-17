import "server-only";

/**
 * Sample accounts for reviewing each permission level. They are real Supabase users,
 * created by `npm run db:seed` and removed by `npm run db:seed -- --remove`.
 * Their password lives only in .env.local (DEMO_PASSWORD) — never in the repo.
 * Remove them before the site goes public.
 */
export const DEMO_ACCOUNTS = {
  admin: "admin@topjgrind.test",
  member: "member@topjgrind.test",
  expiring: "soon@topjgrind.test",
  free: "free@topjgrind.test",
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

export const demoPassword = () => process.env.DEMO_PASSWORD ?? "";
