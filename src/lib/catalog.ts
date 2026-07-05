import { put } from "@vercel/blob";
import { getPrivateBlob } from "./blob-read";
import { SHOP_PRODUCTS } from "./shop-products";

/**
 * Dynamic shop catalog on Vercel Blob (private store `vv-orders`).
 *
 * Layout: ONE JSON document at `catalog/products.json` holding the full
 * product array. The shop is tiny (a handful of products), so a single
 * read-modify-write document is simpler and safer than per-product blobs.
 *
 * Lifecycle:
 * - When the blob does not exist yet, `getCatalog()` returns SEED — the
 *   launch products from @/lib/shop-products (names/prices) merged with the
 *   marketing copy/photos that previously lived only in /shop.js. The
 *   blob is written lazily on the first admin save (or the first order
 *   decrement), so a fresh deployment works with zero setup.
 * - `effectiveSoldOut(p)` is the single sold-out rule: manual flag OR a
 *   tracked quantity that reached 0. `quantity: null` means "not tracked".
 * - Orders decrement quantities via read-modify-write. At this shop's
 *   volume (a few orders a day) racing writers are tolerable by design.
 */

export interface ProductCopy {
  name: string;
  sub: string;
  desc: string;
}

export interface Product {
  slug: string;
  en: ProductCopy;
  ru: ProductCopy;
  priceEgp: number;
  priceRub: number;
  /** Absolute URL (blob upload) or site-relative path ("assets/img/…"). */
  photo: string;
  alt: { en: string; ru: string };
  /** null = stock not tracked; 0 = auto sold-out. */
  quantity: number | null;
  /** Manual sold-out flag, independent of quantity. */
  soldOut: boolean;
  /** Hidden products stay in the catalog but never reach the public API. */
  active: boolean;
  /**
   * Manufacturer usage/application directions (optional, editable in /admin).
   * Surfaced to the AI concierge and the public API so clients can be told
   * how to use what they bought — "according to the manufacturer".
   */
  usage?: { en: string; ru: string };
  createdAt: string;
  updatedAt: string;
}

/** Shape served by the public GET /api/products — no internal fields. */
export interface PublicProduct {
  slug: string;
  name: { en: string; ru: string };
  sub: { en: string; ru: string };
  desc: { en: string; ru: string };
  priceEgp: number;
  priceRub: number;
  photo: string;
  alt: { en: string; ru: string };
  soldOut: boolean;
  /** Manufacturer usage directions, when the owner has provided them. */
  usage?: { en: string; ru: string };
}

export const CATALOG_PATHNAME = "catalog/products.json";

// --- Seed --------------------------------------------------------------------

const SEED_TIMESTAMP = "2026-06-11T00:00:00.000Z";
const SEED_QUANTITY = 20;

/**
 * Neutral placeholder copy / photos for the sample products, keyed by the
 * slugs in @/lib/shop-products (the SEED source of truth for slugs/names/
 * prices). EGP-only by default: the RU strings mirror the EN ones. Replace
 * these from /admin — the seed is only used until the catalog blob exists.
 */
const SEED_COPY: Record<
  string,
  { sub: { en: string; ru: string }; desc: { en: string; ru: string }; photo: string; alt: { en: string; ru: string } }
> = {
  "sample-product-a": {
    sub: { en: "Sample product · replace me", ru: "Sample product · replace me" },
    desc: {
      en: "A placeholder product so the catalog renders on a fresh deployment. Edit or delete it from /admin and add your own.",
      ru: "A placeholder product so the catalog renders on a fresh deployment. Edit or delete it from /admin and add your own.",
    },
    photo: "",
    alt: { en: "Sample product A", ru: "Sample product A" },
  },
  "sample-product-b": {
    sub: { en: "Sample product · replace me", ru: "Sample product · replace me" },
    desc: {
      en: "A placeholder product so the catalog renders on a fresh deployment. Edit or delete it from /admin and add your own.",
      ru: "A placeholder product so the catalog renders on a fresh deployment. Edit or delete it from /admin and add your own.",
    },
    photo: "",
    alt: { en: "Sample product B", ru: "Sample product B" },
  },
  "sample-product-c": {
    sub: { en: "Sample product · replace me", ru: "Sample product · replace me" },
    desc: {
      en: "A placeholder product so the catalog renders on a fresh deployment. Edit or delete it from /admin and add your own.",
      ru: "A placeholder product so the catalog renders on a fresh deployment. Edit or delete it from /admin and add your own.",
    },
    photo: "",
    alt: { en: "Sample product C", ru: "Sample product C" },
  },
};

/**
 * Usage / care notes, surfaced to the AI concierge and the public API so a
 * customer can be told how to use what they bought. Editable per-product in
 * /admin.
 */
const DEFAULT_USAGE = {
  en: "Add usage or care directions for this product from /admin.",
  ru: "Add usage or care directions for this product from /admin.",
};

const SEED_USAGE: Record<string, { en: string; ru: string }> = {
  "sample-product-a": DEFAULT_USAGE,
  "sample-product-b": DEFAULT_USAGE,
  "sample-product-c": DEFAULT_USAGE,
};

/** Short names for the catalog (the descriptive suffix lives in `sub`). */
const SEED_SHORT_NAMES: Record<string, { en: string; ru: string }> = {
  "sample-product-a": { en: "Sample Product A", ru: "Sample Product A" },
  "sample-product-b": { en: "Sample Product B", ru: "Sample Product B" },
  "sample-product-c": { en: "Sample Product C", ru: "Sample Product C" },
};

export const SEED: readonly Product[] = SHOP_PRODUCTS.map((p) => {
  const copy = SEED_COPY[p.slug];
  const names = SEED_SHORT_NAMES[p.slug];
  return {
    slug: p.slug,
    en: {
      name: names?.en ?? p.nameEn,
      sub: copy?.sub.en ?? "",
      desc: copy?.desc.en ?? "",
    },
    ru: {
      name: names?.ru ?? p.nameRu,
      sub: copy?.sub.ru ?? "",
      desc: copy?.desc.ru ?? "",
    },
    priceEgp: p.priceEgp,
    priceRub: p.priceRub,
    photo: copy?.photo ?? "",
    alt: copy?.alt ?? { en: "", ru: "" },
    ...(SEED_USAGE[p.slug] ? { usage: SEED_USAGE[p.slug] } : {}),
    quantity: SEED_QUANTITY,
    soldOut: false,
    active: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
});

function cloneSeed(): Product[] {
  return SEED.map((p) => ({
    ...p,
    en: { ...p.en },
    ru: { ...p.ru },
    alt: { ...p.alt },
    ...(p.usage ? { usage: { ...p.usage } } : {}),
  }));
}

// --- Sold-out rule ------------------------------------------------------------

/** The single source of truth: manual flag OR tracked stock at zero. */
export function effectiveSoldOut(p: Product): boolean {
  return p.soldOut || p.quantity === 0;
}

export function toPublicProduct(p: Product): PublicProduct {
  return {
    slug: p.slug,
    name: { en: p.en.name, ru: p.ru.name },
    sub: { en: p.en.sub, ru: p.ru.sub },
    desc: { en: p.en.desc, ru: p.ru.desc },
    priceEgp: p.priceEgp,
    priceRub: p.priceRub,
    photo: p.photo,
    alt: { ...p.alt },
    soldOut: effectiveSoldOut(p),
    ...(p.usage && (p.usage.en || p.usage.ru)
      ? { usage: { ...p.usage } }
      : {}),
  };
}

// --- Persistence ----------------------------------------------------------------

/**
 * Read the full catalog. A missing blob (fresh store) falls back to SEED;
 * any other failure throws so callers can decide how to degrade — a transient
 * read error must never be mistaken for "empty store" by a writer, or a
 * subsequent save would clobber the real catalog with seed data.
 */
export async function getCatalog(): Promise<Product[]> {
  const result = await getPrivateBlob(CATALOG_PATHNAME);
  // The SDK returns null for a missing blob (fresh store) and throws on
  // transport/auth errors — those propagate to the caller.
  if (!result) return cloneSeed();
  const data = (await new Response(result.stream).json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Catalog blob is corrupt (not an array)");
  }
  return data as Product[];
}

/** Overwrite the catalog document (also performs the lazy first write of SEED edits). */
export async function saveCatalog(products: Product[]): Promise<void> {
  await put(CATALOG_PATHNAME, JSON.stringify(products, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/**
 * Decrement tracked stock after a successful order (read-modify-write).
 * Quantities floor at 0 — which makes the product auto sold-out for all
 * subsequent catalog fetches. Untracked products (quantity: null) and
 * unknown slugs are skipped. Races at this volume are acceptable.
 */
export async function decrementQuantities(
  items: { slug: string; qty: number }[]
): Promise<void> {
  const catalog = await getCatalog();
  const now = new Date().toISOString();
  let changed = false;
  for (const { slug, qty } of items) {
    const product = catalog.find((p) => p.slug === slug);
    if (product && typeof product.quantity === "number") {
      product.quantity = Math.max(0, product.quantity - qty);
      product.updatedAt = now;
      changed = true;
    }
  }
  if (changed) await saveCatalog(catalog);
}

/**
 * Restore tracked stock when an order is cancelled (read-modify-write).
 * The mirror of `decrementQuantities`: quantities are added back only for
 * items that still exist in the catalog AND still track stock — deleted
 * products and untracked (`quantity: null`) ones are skipped. Races at this
 * volume are acceptable.
 */
export async function restoreQuantities(
  items: { slug: string; qty: number }[]
): Promise<void> {
  const catalog = await getCatalog();
  const now = new Date().toISOString();
  let changed = false;
  for (const { slug, qty } of items) {
    const product = catalog.find((p) => p.slug === slug);
    if (product && typeof product.quantity === "number") {
      product.quantity = product.quantity + qty;
      product.updatedAt = now;
      changed = true;
    }
  }
  if (changed) await saveCatalog(catalog);
}

// --- Slugs -----------------------------------------------------------------------

/**
 * Kebab-case slug from the EN name, made unique against the existing catalog
 * by appending -2, -3, … Slugs are immutable after creation (they live in
 * carts, orders and bookmarks).
 */
export function generateSlug(nameEn: string, existing: Set<string>): string {
  const base =
    nameEn
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "product";
  if (!existing.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
}

// --- Price formatting (kept in the catalog module so the order path no longer
// imports @/lib/shop-products, which is now only the SEED source) -----------------

/** "3540" -> "LE 3,540". */
export function formatEgp(amount: number): string {
  return `LE ${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** "4900" -> "4 900 ₽". */
export function formatRub(amount: number): string {
  return `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
}
