#!/usr/bin/env node
// Give an existing account admin (Studio) rights:  npm run db:make-admin -- you@example.com
// The person must have signed up on the site first.
import fs from "node:fs";
import pg from "pg";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run db:make-admin -- <email>");
  process.exit(1);
}
const line = fs.readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("SUPABASE_DB_URL="));
const db = new pg.Client({ connectionString: line.slice("SUPABASE_DB_URL=".length).trim(), ssl: { rejectUnauthorized: false } });
await db.connect();
const r = await db.query(
  "update public.profiles set role = 'admin' where id = (select id from auth.users where lower(email) = lower($1)) returning id",
  [email],
);
console.log(r.rowCount ? `${email} is now an admin.` : `No account found for ${email} — sign up on the site first.`);
await db.end();
