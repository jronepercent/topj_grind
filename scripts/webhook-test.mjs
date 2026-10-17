#!/usr/bin/env node
// Fire a signed test payment at the local webhook.
// Usage: npm run webhook:test -- <email> [reference] [months]
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

const [email = "free@topjgrind.test", reference = `TEST-${randomUUID().slice(0, 8)}`, months = "1"] = process.argv.slice(2);
const secret = env("PAYMENT_WEBHOOK_SECRET");
const base = env("WEBHOOK_TEST_URL") ?? "http://localhost:3000";
if (!secret) {
  console.error("PAYMENT_WEBHOOK_SECRET is not set (.env.local)");
  process.exit(1);
}
const body = JSON.stringify({
  email,
  amount: 300 * Number(months),
  currency: "THB",
  months: Number(months),
  method: "promptpay",
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
