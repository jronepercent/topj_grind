#!/usr/bin/env node
// Self-test for the Kohort → shop product matcher (src/lib/kohort-match.ts). Pure: no database, no network, no env needed.
//   node scripts/kohort-match-test.mts
import assert from "node:assert/strict";
import { normKohortText, pickKohortProduct, type KohortProductCandidate } from "../src/lib/kohort-match.ts";

const LINK_A = "5b0c1e7e-1d3a-4f6e-9a55-0a1b2c3d4e5f";
const products: KohortProductCandidate[] = [
  { id: "p-ebook", title: "คู่มือขาย Digital Product", kohort_name: "E-book OMB", kohort_link_id: LINK_A, price_thb: 990 },
  { id: "p-template", title: "Notion Template Pack", kohort_name: null, kohort_link_id: null, price_thb: 490 },
  { id: "p-course", title: "คอร์ส OMB", kohort_name: "OMB Course", kohort_link_id: null, price_thb: 4990 },
  { id: "p-gone", title: "Old Thing", kohort_name: "Old Thing", kohort_link_id: null, price_thb: 100, deleted_at: "2026-01-01T00:00:00Z" },
];

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};
const pick = (link?: string | null, name?: string | null, list = products) => pickKohortProduct(list, link, name);

test("normalise: trim, collapse whitespace, lower-case, NFC", () => {
  assert.equal(normKohortText("  E-Book \t OMB\n"), "e-book omb");
  assert.equal(normKohortText("\u0e01\u0e33".normalize("NFD")), normKohortText("\u0e01\u0e33")); // same text, different Unicode form
  assert.equal(normKohortText(null), "");
});

test("link_id match (case-insensitive) wins even when the name is different or missing", () => {
  assert.deepEqual(pick(LINK_A)?.how, "link");
  assert.equal(pick(LINK_A.toUpperCase(), "something else")?.product.id, "p-ebook");
  assert.equal(pick(`  ${LINK_A} `, undefined)?.product.id, "p-ebook");
});

test("link_id beats a name that points at another product", () => {
  const m = pick(LINK_A, "OMB Course");
  assert.equal(m?.product.id, "p-ebook");
  assert.equal(m?.how, "link");
});

test("name match with odd spacing and case", () => {
  const m = pick(undefined, "  e-BOOK    omb ");
  assert.equal(m?.product.id, "p-ebook");
  assert.equal(m?.how, "name");
  assert.equal(pick("unknown-link-id", "omb   COURSE")?.product.id, "p-course");
});

test("title fallback only when kohort_name is empty", () => {
  assert.equal(pick(undefined, "notion template pack")?.product.id, "p-template");
  // p-course has a kohort_name, so its title is NOT a valid Kohort name
  assert.equal(pick(undefined, "คอร์ส OMB"), null);
  assert.equal(pick(undefined, "คู่มือขาย Digital Product"), null);
});

test("no match on amount alone (a 990 product is not matched by price, link or name)", () => {
  assert.equal(pick(undefined, undefined), null);
  assert.equal(pick(null, ""), null);
  assert.equal(pick("some-other-link", "990"), null);
});

test("membership-style names do not match a product", () => {
  assert.equal(pick("membership-link-id", "สมาชิกรายเดือน"), null);
  assert.equal(pick("membership-link-id", "TOPJ_GRIND Yearly Membership"), null);
  assert.equal(pick(undefined, "monthly"), null);
});

test("deleted products never match", () => {
  assert.equal(pick(undefined, "Old Thing"), null);
  const gone = [{ ...products[0], deleted_at: "2026-02-02T00:00:00Z" }];
  assert.equal(pick(LINK_A, "E-book OMB", gone), null);
});

test("ambiguous: two products claiming the same name or link match nothing", () => {
  const dupName = [...products, { id: "p-dup", title: "Other", kohort_name: "e-book  omb", kohort_link_id: null, price_thb: 1 }];
  assert.equal(pick(undefined, "E-book OMB", dupName), null);
  const dupLink = [...products, { id: "p-dup2", title: "Other", kohort_name: null, kohort_link_id: LINK_A.toUpperCase(), price_thb: 1 }];
  assert.equal(pick(LINK_A, "E-book OMB", dupLink), null);
});

console.log(`\n${passed} tests passed`);
