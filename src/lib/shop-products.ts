/**
 * SEED-ONLY sample catalog for Fayek OS.
 *
 * These are neutral PLACEHOLDER products so a fresh deployment renders with
 * something in the catalog. Replace them (or just add your own) from /admin —
 * once the dynamic catalog blob exists, this seed is never read again.
 *
 * Orders are validated against the DYNAMIC catalog in @/lib/catalog (Vercel
 * Blob `catalog/products.json`, editable from /admin). This file is the seed
 * source: when the catalog blob does not exist yet, @/lib/catalog builds its
 * SEED from these products.
 *
 * Do NOT import this module from the order path — use @/lib/catalog.
 *
 * Prices are in EGP (integer units, no cents). Fayek OS ships EGP-only, so the
 * RU name mirrors the EN name and priceRub stays 0 — the dual-language/currency
 * schema is retained (dormant) so a second currency/language can be enabled
 * later without a data-model change.
 */

export interface ShopProduct {
  slug: string;
  nameEn: string;
  nameRu: string;
  priceEgp: number;
  priceRub: number;
}

export const SHOP_PRODUCTS: readonly ShopProduct[] = [
  {
    slug: "sample-product-a",
    nameEn: "Sample Product A",
    nameRu: "Sample Product A",
    priceEgp: 1000,
    priceRub: 0,
  },
  {
    slug: "sample-product-b",
    nameEn: "Sample Product B",
    nameRu: "Sample Product B",
    priceEgp: 1500,
    priceRub: 0,
  },
  {
    slug: "sample-product-c",
    nameEn: "Sample Product C",
    nameRu: "Sample Product C",
    priceEgp: 2000,
    priceRub: 0,
  },
] as const;

export const PRODUCTS_BY_SLUG: ReadonlyMap<string, ShopProduct> = new Map(
  SHOP_PRODUCTS.map((p) => [p.slug, p])
);

/** "3540" -> "LE 3,540" (EGP style). */
export function formatEgp(amount: number): string {
  return `LE ${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** "4900" -> "4 900 ₽" (RUB style, space-grouped). Unused (EGP-only) but kept for the schema. */
export function formatRub(amount: number): string {
  return `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
}
