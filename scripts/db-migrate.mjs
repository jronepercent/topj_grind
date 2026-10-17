#!/usr/bin/env node
// Apply supabase/migrations/*.sql to the database in SUPABASE_DB_URL, in name order.
// Each file runs in its own transaction and is recorded in app_private.migrations,
// so re-running only applies new files.
//   npm run db:migrate            apply pending migrations
//   npm run db:migrate -- --dry-run   run them, then roll back (nothing is kept)
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    const line = fs.readFileSync(f, "utf8").split("\n").map((l) => l.trim()).find((l) => l.startsWith(name + "="));
    if (line) return line.slice(name.length + 1).replace(/^["']|["']$/g, "");
  }
}

const url = env("SUPABASE_DB_URL");
if (!url) {
  console.error("SUPABASE_DB_URL is not set (.env.local)");
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");
const dir = path.join("supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(`create schema if not exists app_private;
  revoke all on schema app_private from public;
  create table if not exists app_private.migrations (name text primary key, applied_at timestamptz not null default now());`);
const done = new Set((await client.query("select name from app_private.migrations")).rows.map((r) => r.name));

let failed = false;
for (const f of files) {
  if (done.has(f)) {
    console.log(`skip    ${f} (already applied)`);
    continue;
  }
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into app_private.migrations (name) values ($1)", [f]);
    await client.query(dryRun ? "rollback" : "commit");
    console.log(`${dryRun ? "ok (rolled back)" : "applied"} ${f}`);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    const where = e.position ? ` near: ${sql.slice(Math.max(0, +e.position - 80), +e.position + 40).replace(/\s+/g, " ")}` : "";
    console.error(`FAILED  ${f}: ${e.code ?? ""} ${e.message}${where}`);
    failed = true;
    break;
  }
}
await client.end();
process.exit(failed ? 1 : 0);
