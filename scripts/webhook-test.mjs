#!/usr/bin/env node
// Fire a signed test payment at the local webhook.
// Usage: npm run webhook:test -- <email> [monthly|yearly] [card|promptpay] [reference] [--amount=N]
//   npm run webhook:test -- me@example.com yearly promptpay
import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    const line = fs
      .readFileSync(f, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith(name + "="));
    if (line) return line.slice(name.length + 1).replace(/^["']|["']$/g, "");
  }
}

// Keep in sync with src/lib/plans.ts
const PLANS = { monthly: 990, yearly: 4990 };
const METHODS = ["card", "promptpay"];

const flags = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => a.slice(2).split("=")),
);
const [email = "free@topjgrind.test", plan = "monthly", method = "card", reference = `TEST-${randomUUID().slice(0, 8)}`] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"));
if (!(plan in PLANS)) {
  console.error(`plan must be one of: ${Object.keys(PLANS).join(", ")}`);
  process.exit(1);
}
if (!METHODS.includes(method)) {
  console.error(`method must be one of: ${METHODS.join(", ")}`);
  process.exit(1);
}
const secret = env("PAYMENT_WEBHOOK_SECRET");
const base = env("WEBHOOK_TEST_URL") ?? "http://localhost:3000";
if (!secret) {
  console.error("PAYMENT_WEBHOOK_SECRET is not set (.env.local)");
  process.exit(1);
}
const body = JSON.stringify({
  email,
  amount: flags.amount !== undefined ? Number(flags.amount) : PLANS[plan], // --amount=1 to test the mismatch check
  currency: "THB",
  plan,
  method,
  reference,
  paid_at: new Date().toISOString(),
});
const sig = createHmac("sha256", secret).update(body).digest("hex");
const res = await fetch(`${base}/api/webhooks/payment`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Signature": sig },
  body,
});
console.log(res.status, await res.text(), `(reference=${reference})`);
