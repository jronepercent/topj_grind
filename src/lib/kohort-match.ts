/**
 * Which shop product did a Kohort payment buy? Pure (no DB, no server-only) so scripts/kohort-match-test.mts can run it.
 * Kohort never sends OUR product id — only its own payment-link uuid (`link_id`) and the product's name — so we match on those:
 *   1. link_id equals a product's kohort_link_id (learned from an earlier payment, see kohort.ts)
 *   2. the product name equals the product's kohort_name, or its title when kohort_name is empty
 * The amount is never a reason to match: a product priced like a membership plan must not be mistaken for that plan or the reverse.
 */

export interface KohortProductCandidate {
  id: string;
  title: string;
  kohort_name: string | null;
  kohort_link_id: string | null;
  price_thb: number | string;
  /** Soft-deleted products never match. */
  deleted_at?: string | null;
}

export type KohortMatchHow = "link" | "name";

/** trim, collapse whitespace, lower-case, NFC — so "  Digital  PRODUCT " and "digital product" are the same name. */
export function normKohortText(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * The product a payment belongs to and how we know, or null (no match, or more than one product claims it —
 * guessing between two products would hand the buyer the wrong download).
 */
export function pickKohortProduct<T extends KohortProductCandidate>(
  products: T[],
  linkId?: string | null,
  productName?: string | null,
): { product: T; how: KohortMatchHow } | null {
  const live = products.filter((p) => !p.deleted_at);

  const link = normKohortText(linkId);
  if (link) {
    const byLink = live.filter((p) => normKohortText(p.kohort_link_id) === link);
    if (byLink.length === 1) return { product: byLink[0], how: "link" };
    if (byLink.length > 1) return null;
  }

  const name = normKohortText(productName);
  if (!name) return null;
  // An explicit Kohort name beats a title that happens to be the same text.
  const byKohortName = live.filter((p) => normKohortText(p.kohort_name) === name);
  if (byKohortName.length) return byKohortName.length === 1 ? { product: byKohortName[0], how: "name" } : null;
  const byTitle = live.filter((p) => !normKohortText(p.kohort_name) && normKohortText(p.title) === name);
  return byTitle.length === 1 ? { product: byTitle[0], how: "name" } : null;
}
