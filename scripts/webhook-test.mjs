#!/usr/bin/env node
// Fire a signed test payment at the local webhook.
// Membership: npm run webhook:test -- <email> [monthly|yearly] [card|promptpay] [reference] [--amount=N]
//   npm run webhook:test -- me@example.com yearly promptpay
// Shop product: npm run webhook:test -- <email> [card|promptpay] [reference] --product=<product id> [--amount=N]
//   npm run webhook:test -- me@example.com card --product=3f2c1a9e-... (amount defaults to the product's price)
//   Looks the price up with --price=N, e.g. --price=1290 (the same number as the product's price_thb in Studio).
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
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const productId = flags.product;
// Product purchase: <email> [method] [reference]; membership: <email> [plan] [method] [reference]
const email = positional[0] ?? "free@topjgrind.test";
const plan = productId ? undefined : (positional[1] ?? "monthly");
const method = (productId ? positional[1] : positional[2]) ?? "card";
const reference = (productId ? positional[2] : positional[3]) ?? `TEST-${randomUUID().slice(0, 8)}`;
if (productId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) {
  console.error("--product must be a product id (uuid) from Studio → ร้านค้า");
  process.exit(1);
}
if (productId && flags.amount === undefined && flags.price === undefined) {
  console.error("pass --price=<the product's price in baht> (or --amount=N to test a mismatch)");
  process.exit(1);
}
if (!productId && !(plan in PLANS)) {
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
  // --amount=1 to test the mismatch check
  amount: flags.amount !== undefined ? Number(flags.amount) : productId ? Number(flags.price) : PLANS[plan],
  currency: "THB",
  ...(productId ? { product_id: productId } : { plan }),
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
