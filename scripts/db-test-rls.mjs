#!/usr/bin/env node
// Row Level Security tests against the real database in SUPABASE_DB_URL.
// Everything runs inside one transaction that is ROLLED BACK at the end — nothing is kept.
//   npm run db:test-rls
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    const line = fs.readFileSync(f, "utf8").split("\n").map((l) => l.trim()).find((l) => l.startsWith(name + "="));
    if (line) return line.slice(name.length + 1).replace(/^["']|["']$/g, "");
  }
}

const db = new pg.Client({ connectionString: env("SUPABASE_DB_URL"), ssl: { rejectUnauthorized: false } });
await db.connect();
const q = (sql, params) => db.query(sql, params);

const U = { admin: randomUUID(), member: randomUUID(), free: randomUUID() };
const C = { pub: randomUUID(), mem: randomUUID(), draft: randomUUID() };
let pass = 0;
let fail = 0;

async function as(who, fn) {
  // switch to the browser's role for this step
  if (who === "anon") {
    await q("set local role anon");
    await q("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true), set_config('request.jwt.claim.sub', '', true)");
  } else {
    await q("set local role authenticated");
    const claims = JSON.stringify({ sub: U[who], role: "authenticated" });
    await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [claims, U[who]]);
  }
  // No reset here: check() rolls back to its savepoint, which also undoes SET LOCAL ROLE.
  return fn();
}

async function check(name, who, fn, expect) {
  await q("savepoint t");
  let outcome;
  try {
    outcome = { ok: true, value: await as(who, fn) };
  } catch (e) {
    outcome = { ok: false, code: e.code, message: e.message };
  }
  await q("rollback to savepoint t");
  const good = expect(outcome);
  good ? pass++ : fail++;
  const detail = outcome.ok ? JSON.stringify(outcome.value) : `${outcome.code} ${outcome.message}`;
  console.log(`${good ? "PASS" : "FAIL"}  [${who}] ${name}${good ? "" : `  → ${detail}`}`);
}
const denied = (o) => !o.ok && ["42501", "42P01"].includes(o.code);
const rlsBlocked = (o) => !o.ok && o.code === "42501";

try {
  await q("begin");
  // ── fixtures (as owner) ──
  for (const [k, id] of Object.entries(U)) {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, $3, now(), now())`,
      [id, `rls-${k}-${id.slice(0, 6)}@example.test`, JSON.stringify({ display_name: `rls ${k}` })],
    );
  }
  await q("update profiles set role = 'admin' where id = $1", [U.admin]);
  await q("update subscriptions set expires_at = now() + interval '20 days' where user_id = $1", [U.member]);
  const ins = `insert into content (id, type, title, visibility, status, media_status, published_at, bunny_video_id)
               values ($1, 'video', $2, $3, $4, 'ready', $5, $6)`;
  await q(ins, [C.pub, "rls public", "public", "published", new Date(Date.now() - 60_000), "vid-pub"]);
  await q(ins, [C.mem, "rls members", "members", "published", new Date(Date.now() - 60_000), "vid-mem"]);
  await q(ins, [C.draft, "rls draft", "public", "draft", null, "vid-draft"]);
  const memberComment = (await q("insert into comments (content_id, user_id, body) values ($1, $2, 'hello') returning id", [C.pub, U.member])).rows[0].id;

  // ── guests ──
  await check("sees live clips but not drafts", "anon",
    async () => (await q("select id from content_public where id = any($1)", [[C.pub, C.mem, C.draft]])).rowCount,
    (o) => o.ok && o.value === 2);
  await check("cannot read media location (bunny_video_id)", "anon",
    () => q("select bunny_video_id from content where id = $1", [C.pub]), denied);
  await check("cannot read subscriptions", "anon", () => q("select * from subscriptions"), denied);
  await check("cannot comment", "anon",
    () => q("insert into comments (content_id, user_id, body) values ($1, $2, 'x')", [C.pub, U.free]), denied);

  // ── free (signed in, not paid) ──
  await check("can comment on a public clip", "free",
    async () => (await q("insert into comments (content_id, user_id, body) values ($1, $2, 'hi') returning id", [C.pub, U.free])).rowCount,
    (o) => o.ok && o.value === 1);
  await check("cannot comment on a members clip", "free",
    () => q("insert into comments (content_id, user_id, body) values ($1, $2, 'hi')", [C.mem, U.free]), rlsBlocked);
  await check("cannot like a members clip", "free",
    () => q("insert into likes (user_id, content_id) values ($1, $2)", [U.free, C.mem]), rlsBlocked);
  await check("cannot save a members clip", "free",
    () => q("insert into saved (user_id, content_id) values ($1, $2)", [U.free, C.mem]), rlsBlocked);
  await check("cannot edit someone else's comment (0 rows)", "free",
    async () => (await q("update comments set body = 'hacked' where id = $1", [memberComment])).rowCount,
    (o) => o.ok && o.value === 0);
  await check("cannot make themselves admin", "free",
    () => q("update profiles set role = 'admin' where id = $1", [U.free]), denied);
  await check("cannot give themselves membership", "free",
    () => q("insert into subscriptions (user_id, expires_at) values ($1, now() + interval '1 year') on conflict (user_id) do update set expires_at = excluded.expires_at", [U.free]),
    rlsBlocked);
  await check("cannot call apply_payment", "free",
    () => q("select apply_payment($1, 300, 'THB', 1, 'card', 'x', now(), '{}')", [U.free]), denied);
  await check("cannot see other people's watch history", "free",
    async () => (await q("select * from watch_progress where user_id <> $1", [U.free])).rowCount,
    (o) => o.ok && o.value === 0);
  await check("forged pin/likes on insert are reset", "free",
    async () => (await q("insert into comments (content_id, user_id, body, is_pinned, like_count) values ($1, $2, 'x', true, 999) returning is_pinned, like_count", [C.pub, U.free])).rows[0],
    (o) => o.ok && o.value.is_pinned === false && o.value.like_count === 0);

  // ── member ──
  await check("can comment on a members clip", "member",
    async () => (await q("insert into comments (content_id, user_id, body) values ($1, $2, 'yo') returning id", [C.mem, U.member])).rowCount,
    (o) => o.ok && o.value === 1);
  await check("like on a members clip bumps like_count", "member",
    async () => {
      await q("insert into likes (user_id, content_id) values ($1, $2)", [U.member, C.mem]);
      return (await q("select like_count from content_public where id = $1", [C.mem])).rows[0].like_count;
    },
    (o) => o.ok && o.value === 1);
  await check("editing own comment stamps (แก้ไขแล้ว)", "member",
    async () => (await q("update comments set body = 'hello again' where id = $1 returning edited_at", [memberComment])).rows[0].edited_at,
    (o) => o.ok && o.value !== null);
  await check("cannot inflate own comment likes", "member",
    () => q("update comments set like_count = 500 where id = $1", [memberComment]), denied);
  await check("cannot pin own comment", "member",
    () => q("update comments set is_pinned = true where id = $1", [memberComment]), denied);
  await check("cannot read draft clips", "member",
    async () => (await q("select id from content_public where id = $1", [C.draft])).rowCount,
    (o) => o.ok && o.value === 0);

  // ── admin (JR) ──
  await check("can pin a comment", "admin",
    async () => (await q("update comments set is_pinned = true where id = $1 returning is_pinned", [memberComment])).rows[0]?.is_pinned,
    (o) => o.ok && o.value === true);
  await check("can see drafts", "admin",
    async () => (await q("select id from content_public where id = $1", [C.draft])).rowCount,
    (o) => o.ok && o.value === 1);
} finally {
  await q("rollback").catch(() => {});
}

// payment check runs as the table owner (the webhook uses the service role)
try {
  await q("begin");
  await q(
    `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now())`,
    [U.free, `rls-pay-${U.free.slice(0, 6)}@example.test`],
  );
  await q("update subscriptions set expires_at = now() + interval '5 days' where user_id = $1", [U.free]);
  const before = (await q("select expires_at from subscriptions where user_id = $1", [U.free])).rows[0].expires_at;
  const a = (await q("select apply_payment($1, 300, 'THB', 1, 'promptpay', 'RLS-TEST-REF', now(), '{}') e", [U.free])).rows[0].e;
  const b = (await q("select apply_payment($1, 300, 'THB', 1, 'promptpay', 'RLS-TEST-REF', now(), '{}') e", [U.free])).rows[0].e;
  const days = (new Date(a) - new Date(before)) / 86_400_000;
  const ok = Math.abs(days - 30) < 0.01 && +new Date(a) === +new Date(b);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  [webhook] early renewal adds exactly 30 days (${days.toFixed(2)}) and a repeated reference adds nothing`);
} finally {
  await q("rollback").catch(() => {});
}

await db.end();
console.log(`\n${pass} passed, ${fail} failed (all test data rolled back)`);
process.exit(fail ? 1 : 0);
