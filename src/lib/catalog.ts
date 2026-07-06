import { db } from "./db";
import { isoString } from "./db-dates";
import { SHOP_PRODUCTS } from "./shop-products";

/**
 * Product catalogue in Postgres (table `products`).
 *
 * Moved out of the single Vercel Blob JSON so stock changes are ATOMIC:
 * `decrementQuantities`/`addQuantities`/`restoreQuantities` are single
 * row-locked `UPDATE`s (`quantity = quantity ± n`), which the database
 * serialises — no read-modify-write over one file, so concurrent fulfilments
 * can't lose each other's updates. Product create/edit/delete go through
 * `saveCatalog`, which syncs the array to the table inside one transaction.
 *
 * - `effectiveSoldOut(p)`: manual flag OR a tracked quantity at 0.
 *   `quantity: null` means "not tracked".
 * - A fresh (empty) table self-seeds from SEED on first read.
 */

export interface ProductCopy {
  name: string;
  sub: string;
  desc: string;
}

export interface Product {
  slug: string;
  en: ProductCopy;
  ar: ProductCopy;
  priceEgp: number;
  /** Absolute URL (blob upload) or site-relative path ("assets/img/…"). */
  photo: string;
  alt: { en: string; ar: string };
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
  usage?: { en: string; ar: string };
  createdAt: string;
  updatedAt: string;
}

/** Shape served by the public GET /api/products — no internal fields. */
export interface PublicProduct {
  slug: string;
  name: { en: string; ar: string };
  sub: { en: string; ar: string };
  desc: { en: string; ar: string };
  priceEgp: number;
  photo: string;
  alt: { en: string; ar: string };
  soldOut: boolean;
  /** Manufacturer usage directions, when the owner has provided them. */
  usage?: { en: string; ar: string };
}

export const CATALOG_PATHNAME = "catalog/products.json";

// --- Seed --------------------------------------------------------------------

const SEED_TIMESTAMP = "2026-06-11T00:00:00.000Z";

/**
 * The seed catalog is built directly from @/lib/shop-products — one Product per
 * line item in the company stock sheet, carrying its real on-hand quantity and
 * its code as the name/SKU. The full sheet text is the description; `sub` is
 * left empty and the owner can enrich copy/photos from /admin. Single-currency
 * (EGP) and bilingual EN/AR: the Arabic strings mirror the English ones until
 * the owner adds Arabic copy in /admin.
 */
export const SEED: readonly Product[] = SHOP_PRODUCTS.map((p) => ({
  slug: p.slug,
  en: { name: p.nameEn, sub: "", desc: p.descEn },
  ar: { name: p.nameAr, sub: "", desc: p.descEn },
  priceEgp: p.priceEgp,
  photo: "",
  alt: { en: p.nameEn, ar: p.nameAr },
  quantity: p.quantity,
  soldOut: false,
  active: true,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP,
}));

function cloneSeed(): Product[] {
  return SEED.map((p) => ({
    ...p,
    en: { ...p.en },
    ar: { ...p.ar },
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
    name: { en: p.en.name, ar: p.ar.name },
    sub: { en: p.en.sub, ar: p.ar.sub },
    desc: { en: p.en.desc, ar: p.ar.desc },
    priceEgp: p.priceEgp,
    photo: p.photo,
    alt: { ...p.alt },
    soldOut: effectiveSoldOut(p),
    ...(p.usage && (p.usage.en || p.usage.ar)
      ? { usage: { ...p.usage } }
      : {}),
  };
}

// --- Persistence (Postgres) -----------------------------------------------------

interface ProductRow {
  slug: string; name_en: string; sub_en: string; desc_en: string;
  name_ar: string; sub_ar: string; desc_ar: string; price_egp: number;
  photo: string; alt_en: string; alt_ar: string; quantity: number | null;
  sold_out: boolean; active: boolean; usage_en: string; usage_ar: string;
  created_at: unknown; updated_at: unknown;
}

function rowToProduct(r: ProductRow): Product {
  const usageEn = r.usage_en ?? ""; const usageAr = r.usage_ar ?? "";
  return {
    slug: r.slug,
    en: { name: r.name_en, sub: r.sub_en, desc: r.desc_en },
    ar: { name: r.name_ar, sub: r.sub_ar, desc: r.desc_ar },
    priceEgp: Number(r.price_egp),
    photo: r.photo,
    alt: { en: r.alt_en, ar: r.alt_ar },
    quantity: r.quantity === null ? null : Number(r.quantity),
    soldOut: Boolean(r.sold_out),
    active: Boolean(r.active),
    ...(usageEn || usageAr ? { usage: { en: usageEn, ar: usageAr } } : {}),
    createdAt: isoString(r.created_at),
    updatedAt: isoString(r.updated_at),
  };
}

/** Upsert query for one product (created_at preserved on conflict). */
function upsertQuery(p: Product) {
  const usage = p.usage ?? { en: "", ar: "" };
  const created = p.createdAt || new Date().toISOString();
  const updated = p.updatedAt || new Date().toISOString();
  return db()`
    INSERT INTO products (
      slug, name_en, sub_en, desc_en, name_ar, sub_ar, desc_ar, price_egp,
      photo, alt_en, alt_ar, quantity, sold_out, active, usage_en, usage_ar,
      created_at, updated_at
    ) VALUES (
      ${p.slug}, ${p.en.name}, ${p.en.sub}, ${p.en.desc}, ${p.ar.name}, ${p.ar.sub}, ${p.ar.desc}, ${Math.round(p.priceEgp)},
      ${p.photo}, ${p.alt.en}, ${p.alt.ar}, ${p.quantity}, ${p.soldOut}, ${p.active}, ${usage.en}, ${usage.ar},
      ${created}, ${updated}
    )
    ON CONFLICT (slug) DO UPDATE SET
      name_en=EXCLUDED.name_en, sub_en=EXCLUDED.sub_en, desc_en=EXCLUDED.desc_en,
      name_ar=EXCLUDED.name_ar, sub_ar=EXCLUDED.sub_ar, desc_ar=EXCLUDED.desc_ar,
      price_egp=EXCLUDED.price_egp, photo=EXCLUDED.photo, alt_en=EXCLUDED.alt_en, alt_ar=EXCLUDED.alt_ar,
      quantity=EXCLUDED.quantity, sold_out=EXCLUDED.sold_out, active=EXCLUDED.active,
      usage_en=EXCLUDED.usage_en, usage_ar=EXCLUDED.usage_ar, updated_at=EXCLUDED.updated_at
  `;
}

async function seedIfEmpty(): Promise<void> {
  const seed = cloneSeed();
  if (seed.length > 0) await db().transaction(seed.map(upsertQuery));
}

/** Read the full catalog. A fresh (empty) table self-seeds from SEED. */
export async function getCatalog(): Promise<Product[]> {
  let rows = (await db()`SELECT * FROM products ORDER BY slug`) as ProductRow[];
  if (rows.length === 0) {
    await seedIfEmpty();
    rows = (await db()`SELECT * FROM products ORDER BY slug`) as ProductRow[];
    if (rows.length === 0) return cloneSeed();
  }
  return rows.map(rowToProduct);
}

/**
 * Sync the given product array to the table in ONE transaction (used by
 * product create/edit/delete): upsert every product, delete any row whose slug
 * is no longer present. Stock changes should use the atomic helpers below, not
 * this whole-array sync.
 */
export async function saveCatalog(products: Product[]): Promise<void> {
  const slugs = products.map((p) => p.slug);
  const queries = products.map(upsertQuery);
  queries.push(db()`DELETE FROM products WHERE slug <> ALL(${slugs}::text[])`);
  await db().transaction(queries);
}

/**
 * Decrement tracked stock after a successful order/fulfilment. Each item is an
 * ATOMIC, row-locked single-statement UPDATE — concurrent callers serialise and
 * never lose an update. Quantities floor at 0 (auto sold-out). Untracked
 * products (quantity NULL) and unknown slugs are skipped.
 */
export async function decrementQuantities(
  items: { slug: string; qty: number }[]
): Promise<void> {
  for (const { slug, qty } of items) {
    if (!(qty > 0)) continue;
    await db()`
      UPDATE products SET quantity = GREATEST(0, quantity - ${Math.round(qty)}), updated_at = now()
      WHERE slug = ${slug} AND quantity IS NOT NULL
    `;
  }
}

/** Add received stock to tracked products (atomic per-item UPDATE). */
export async function addQuantities(
  items: { slug: string; qty: number }[]
): Promise<void> {
  for (const { slug, qty } of items) {
    if (!(qty > 0)) continue;
    await db()`
      UPDATE products SET quantity = quantity + ${Math.round(qty)}, updated_at = now()
      WHERE slug = ${slug} AND quantity IS NOT NULL
    `;
  }
}

/** Restore tracked stock when an order is cancelled (atomic per-item UPDATE). */
export async function restoreQuantities(
  items: { slug: string; qty: number }[]
): Promise<void> {
  for (const { slug, qty } of items) {
    if (!(qty > 0)) continue;
    await db()`
      UPDATE products SET quantity = quantity + ${Math.round(qty)}, updated_at = now()
      WHERE slug = ${slug} AND quantity IS NOT NULL
    `;
  }
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
