"use client";

import { useRef, useState, useEffect } from "react";
import type { Product } from "@/lib/catalog";

/**
 * Products manager — the owner's catalog CRUD inside /admin.
 *
 * - List: photo thumb, EN name, prices, inline-editable quantity, status
 *   chips, Edit / Sold-out toggle / Delete, plus "Add product".
 * - Form (add/edit): EN+RU copy, prices, quantity (empty = untracked),
 *   photo as pasted URL OR file upload via /api/admin/media, alt texts.
 *   Slug auto-generates server-side on create and is immutable on edit.
 *
 * Auth: when the owner came through the legacy ?key= link the key is passed
 * down and sent as x-admin-key; with Basic auth the browser re-attaches the
 * Authorization header to these same-origin fetches automatically.
 */

const SITE_BASE = "https://www.fayekabrasives.com/";

/* ---------- helpers ---------- */

/** Mirrors effectiveSoldOut() in @/lib/catalog (kept local — the lib pulls in the Blob SDK). */
function isSoldOut(p: Product): boolean {
  return p.soldOut || p.quantity === 0;
}

/** Resolve site-relative photo paths against the public site for thumbnails. */
function photoSrc(photo: string): string {
  if (!photo) return "";
  return /^https?:\/\//i.test(photo) ? photo : SITE_BASE + photo;
}

function authHeaders(adminKey: string): Record<string, string> {
  return adminKey ? { "x-admin-key": adminKey } : {};
}

async function readError(res: Response): Promise<string> {
  const payload = (await res.json().catch(() => null)) as {
    error?: string;
    fields?: Record<string, string>;
  } | null;
  if (payload?.fields) {
    const first = Object.values(payload.fields)[0];
    if (first) return first;
  }
  if (payload?.error) return payload.error;
  return `Request failed (${res.status})`;
}

/* ---------- status chips (earthy palette) ---------- */

function statusChips(p: Product): { label: string; cls: string }[] {
  const chips: { label: string; cls: string }[] = [];
  if (!p.active) {
    chips.push({ label: "Hidden", cls: "bg-[#0E2A47]/10 text-[#0E2A47]" });
  }
  if (p.soldOut) {
    chips.push({
      label: "Sold out (manual)",
      cls: "bg-[#CC4038]/15 text-[#CC4038]",
    });
  } else if (p.quantity === 0) {
    chips.push({
      label: "Sold out (0 qty)",
      cls: "bg-[#CC4038]/15 text-[#CC4038]",
    });
  }
  if (p.active && chips.length === 0) {
    chips.push({ label: "Active", cls: "bg-[#5B7186]/15 text-[#3B5578]" });
  }
  return chips;
}

/* ---------- shared styles ---------- */

const inputCls =
  "w-full rounded-xl border border-[#0E2A47]/15 bg-white px-3 py-2 text-sm text-[#0E2A47] outline-none focus:border-[#1668C7]";
const labelCls =
  "mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[#5B7186]";
const buttonBase =
  "rounded-full px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50";
const primaryBtn = `${buttonBase} bg-[#1668C7] text-[#F4F8FD] hover:opacity-90`;
const subtleBtn = `${buttonBase} border border-[#0E2A47]/15 bg-[#F4F8FD] text-[#0E2A47] hover:bg-[#E4EEFA]`;
const dangerBtn = `${buttonBase} border border-[#CC4038]/30 bg-[#F4F8FD] text-[#CC4038] hover:bg-[#CC4038]/5`;

/* ---------- product form (add / edit) ---------- */

interface FormState {
  enName: string;
  enSub: string;
  enDesc: string;
  enUsage: string;
  arName: string;
  arSub: string;
  arDesc: string;
  arUsage: string;
  priceEgp: string;
  quantity: string; // "" = untracked
  photo: string;
  altEn: string;
  altAr: string;
  active: boolean;
}

function toFormState(p: Product | null): FormState {
  return {
    enName: p?.en.name ?? "",
    enSub: p?.en.sub ?? "",
    enDesc: p?.en.desc ?? "",
    enUsage: p?.usage?.en ?? "",
    arName: p?.ar.name ?? "",
    arSub: p?.ar.sub ?? "",
    arDesc: p?.ar.desc ?? "",
    arUsage: p?.usage?.ar ?? "",
    priceEgp: p ? String(p.priceEgp) : "",
    quantity: p && p.quantity !== null ? String(p.quantity) : "",
    photo: p?.photo ?? "",
    altEn: p?.alt.en ?? "",
    altAr: p?.alt.ar ?? "",
    active: p?.active ?? true,
  };
}

function ProductForm({
  product,
  adminKey,
  onSaved,
  onCancel,
}: {
  product: Product | null; // null = create
  adminKey: string;
  onSaved: (saved: Product) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(product));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  async function uploadPhoto(file: File) {
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError("Only JPEG, PNG or WebP images are allowed.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Image must be at most 4 MB.");
      return;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: authHeaders(adminKey),
        body: data,
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const payload = (await res.json()) as { url: string };
      set({ photo: payload.url });
    } catch {
      setError("Upload failed — network error.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    setError(null);
    const priceEgp = Number(form.priceEgp);
    if (!form.enName.trim()) {
      setError("An English name is required.");
      return;
    }
    if (!Number.isInteger(priceEgp) || priceEgp < 0 || form.priceEgp === "") {
      setError("Price (EGP) must be a whole number.");
      return;
    }
    let quantity: number | null = null;
    if (form.quantity.trim() !== "") {
      quantity = Number(form.quantity);
      if (!Number.isInteger(quantity) || quantity < 0) {
        setError("Quantity must be a whole number (or empty for untracked).");
        return;
      }
    }

    // Arabic fields are optional; fall back to the English values.
    const arName = form.arName.trim() || form.enName.trim();
    const body = {
      en: { name: form.enName.trim(), sub: form.enSub.trim(), desc: form.enDesc.trim() },
      ar: { name: arName, sub: form.arSub.trim(), desc: form.arDesc.trim() || form.enDesc.trim() },
      usage: { en: form.enUsage.trim(), ar: form.arUsage.trim() },
      priceEgp,
      quantity,
      photo: form.photo.trim(),
      alt: { en: form.altEn.trim(), ar: form.altAr.trim() || arName },
      active: form.active,
    };

    setBusy(true);
    try {
      const res = await fetch(
        product
          ? `/api/admin/catalog/${encodeURIComponent(product.slug)}`
          : "/api/admin/catalog",
        {
          method: product ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(adminKey) },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const payload = (await res.json()) as { product: Product };
      onSaved(payload.product);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#1668C7]/25 bg-[#F4F8FD] px-5 py-5 shadow-sm">
      <h3 className="font-serif text-xl text-[#0E2A47]">
        {product ? `Edit — ${product.en.name}` : "Add product"}
      </h3>
      {product && (
        <p className="mt-1 text-xs text-[#5B7186]">
          Slug: <code>{product.slug}</code> (permanent)
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Name (EN)</label>
            <input className={inputCls} value={form.enName} onChange={(e) => set({ enName: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Subtitle (EN)</label>
            <input className={inputCls} value={form.enSub} placeholder="DM line · 150 ml" onChange={(e) => set({ enSub: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Description (EN)</label>
            <textarea className={inputCls} rows={3} value={form.enDesc} onChange={(e) => set({ enDesc: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Usage instructions (EN)</label>
            <textarea
              className={inputCls}
              rows={3}
              value={form.enUsage}
              placeholder="Manufacturer's application directions — how and when to use"
              onChange={(e) => set({ enUsage: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Name (AR) — optional</label>
            <input className={inputCls} dir="rtl" value={form.arName} onChange={(e) => set({ arName: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Subtitle (AR)</label>
            <input className={inputCls} dir="rtl" value={form.arSub} onChange={(e) => set({ arSub: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Description (AR)</label>
            <textarea className={inputCls} dir="rtl" rows={3} value={form.arDesc} onChange={(e) => set({ arDesc: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Usage instructions (AR)</label>
            <textarea
              className={inputCls}
              dir="rtl"
              rows={3}
              value={form.arUsage}
              onChange={(e) => set({ arUsage: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Price (EGP)</label>
          <input className={inputCls} inputMode="numeric" value={form.priceEgp} onChange={(e) => set({ priceEgp: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Quantity {product ? "(locked)" : "(empty = untracked)"}</label>
          {product ? (
            <div className="rounded-xl border border-[#0E2A47]/10 bg-[#EEF3F9] px-3 py-2 text-sm text-[#5B7186]">
              {form.quantity === "" ? "Untracked" : form.quantity} · <span className="text-[#0E2A47]">changes require Owner approval — use “Adjust” in the list</span>
            </div>
          ) : (
            <input className={inputCls} inputMode="numeric" value={form.quantity} placeholder="—" onChange={(e) => set({ quantity: e.target.value })} />
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className={labelCls}>Photo — paste a URL or upload</label>
          <input
            className={inputCls}
            value={form.photo}
            placeholder="https://… or assets/img/shop/x.jpg"
            onChange={(e) => set({ photo: e.target.value })}
          />
          <div className="mt-2 flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-sm text-[#5B7186] file:mr-3 file:rounded-full file:border-0 file:bg-[#0E2A47]/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#0E2A47]"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
              }}
            />
            {uploading && <span className="text-sm text-[#5B7186]">Uploading…</span>}
          </div>
          {form.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoSrc(form.photo)}
              alt="Product preview"
              className="mt-3 h-24 w-24 rounded-xl border border-[#0E2A47]/10 object-cover"
            />
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Photo alt text (EN)</label>
            <input className={inputCls} value={form.altEn} onChange={(e) => set({ altEn: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Photo alt text (AR)</label>
            <input className={inputCls} dir="rtl" value={form.altAr} onChange={(e) => set({ altAr: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#0E2A47]">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set({ active: e.target.checked })}
            className="h-4 w-4 accent-[#1668C7]"
          />
          Visible in the shop
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-[#CC4038]">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={busy || uploading} onClick={() => void submit()} className={primaryBtn}>
          {busy ? "Saving…" : product ? "Save changes" : "Create product"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={subtleBtn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------- inline quantity editor ---------- */

/**
 * Stock can never be edited directly — this requests an adjustment that ONLY
 * the Owner can approve. Shows the current qty (read-only) and, on "Adjust",
 * captures a new value + reason and raises an approval.
 */
function QuantityEditor({
  product,
  onError,
}: {
  product: Product;
  onError: (message: string) => void;
}) {
  const current = product.quantity === null ? "—" : String(product.quantity);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current === "—" ? "" : current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function request() {
    const trimmed = value.trim();
    let requestedQty: number | null = null;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0) return onError("New quantity must be a whole number ≥ 0 (or empty for untracked).");
      requestedQty = n;
    }
    if (!reason.trim()) return onError("Add a reason for the adjustment.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/stock-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: product.slug, requestedQty, reason: reason.trim() }),
      });
      if (!res.ok) return onError(await readError(res));
      setSent(true);
      setOpen(false);
    } catch {
      onError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1.5">
        <label className="text-xs text-[#5B7186]">Qty</label>
        <span className="min-w-[2rem] rounded-lg bg-[#EEF3F9] px-2 py-1 text-center text-sm font-medium text-[#0E2A47]" title="Locked — changes require Owner approval">{current}</span>
        {sent ? (
          <span className="text-xs font-medium text-[#0E7490]">Sent to Owner ✓</span>
        ) : (
          <button type="button" onClick={() => setOpen(!open)}
            className="rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-2.5 py-1 text-xs font-medium text-[#1668C7] hover:bg-[#E4EEFA]">
            Adjust
          </button>
        )}
      </span>
      {open && !sent && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#0E2A47]/10 bg-[#F4F8FD] p-2">
          <input className="w-16 rounded-lg border border-[#0E2A47]/15 bg-white px-2 py-1 text-center text-sm" inputMode="numeric" placeholder="New qty" value={value} onChange={(e) => setValue(e.target.value)} />
          <input className="w-44 rounded-lg border border-[#0E2A47]/15 bg-white px-2 py-1 text-sm" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" disabled={busy} onClick={() => void request()}
            className="rounded-full bg-[#1668C7] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
            {busy ? "…" : "Request approval"}
          </button>
        </div>
      )}
    </span>
  );
}

/* ---------- product row ---------- */

function ProductRow({
  product,
  adminKey,
  canManage,
  canEditStock,
  onUpdated,
  onDeleted,
  onEdit,
}: {
  product: Product;
  adminKey: string;
  canManage: boolean;
  canEditStock: boolean;
  onUpdated: (p: Product) => void;
  onDeleted: (slug: string) => void;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/catalog/${encodeURIComponent(product.slug)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders(adminKey) },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const payload = (await res.json()) as { product: Product };
      onUpdated(payload.product);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete “${product.en.name}”? This removes it from the shop permanently. Past orders are not affected.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/catalog/${encodeURIComponent(product.slug)}`,
        { method: "DELETE", headers: authHeaders(adminKey) }
      );
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      onDeleted(product.slug);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-4 py-4 shadow-sm sm:px-5">
      <div className="flex items-start gap-3">
        {product.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc(product.photo)}
            alt={product.alt.en || product.en.name}
            className="h-16 w-16 shrink-0 rounded-xl border border-[#0E2A47]/10 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#E2EAF4] font-serif text-xl text-[#0E2A47]">
            {product.en.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-serif text-lg leading-snug text-[#0E2A47]">
              {product.en.name}
            </h3>
            {statusChips(product).map((chip) => (
              <span
                key={chip.label}
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${chip.cls}`}
              >
                {chip.label}
              </span>
            ))}
          </div>
          <p className="mt-0.5 text-sm text-[#5B7186]">
            {product.priceEgp.toLocaleString("en-EG")} EGP
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {canEditStock ? (
              <QuantityEditor
                key={`${product.slug}-${product.quantity}`}
                product={product}
                onError={setError}
              />
            ) : (
              <span className="text-sm text-[#5B7186]">
                In stock:{" "}
                {product.quantity === null ? "not tracked" : product.quantity}
              </span>
            )}
          </div>
        </div>
      </div>

      {(canManage || canEditStock) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canManage && (
            <button type="button" disabled={busy} onClick={onEdit} className={subtleBtn}>
              Edit
            </button>
          )}
          {canEditStock && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ soldOut: !product.soldOut })}
              className={subtleBtn}
            >
              {product.soldOut ? "Mark in stock" : "Mark sold out"}
            </button>
          )}
          {canManage && (
            <button type="button" disabled={busy} onClick={() => void remove()} className={dangerBtn}>
              Delete
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-[#CC4038]">{error}</p>}
    </article>
  );
}

/* ---------- section ---------- */

export default function ProductsSection({
  initialProducts,
  adminKey,
  loadError,
  canManage = true,
  canEditStock = true,
}: {
  initialProducts: Product[];
  adminKey: string;
  loadError: string | null;
  /** Owner/Admin: add/edit/delete products and set prices. */
  canManage?: boolean;
  /** Owner/Admin/Inventory: adjust stock quantities. */
  canEditStock?: boolean;
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  // Reflect server auto-refreshes (own actions, cron, other users) into the list.
  useEffect(() => { setProducts(initialProducts); }, [initialProducts]);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reportFilter, setReportFilter] = useState<"all" | "tracked" | "low" | "out">("all");
  const [query, setQuery] = useState("");

  function handleUpdated(updated: Product) {
    setProducts((list) =>
      list.map((p) => (p.slug === updated.slug ? updated : p))
    );
    setEditingSlug(null);
  }

  function handleCreated(created: Product) {
    setProducts((list) => [...list, created]);
    setAdding(false);
  }

  function handleDeleted(slug: string) {
    setProducts((list) => list.filter((p) => p.slug !== slug));
  }

  const editing = editingSlug
    ? products.find((p) => p.slug === editingSlug) ?? null
    : null;

  const q = query.trim().toLowerCase();
  const shown = q
    ? products.filter(
        (p) =>
          p.slug.toLowerCase().includes(q) ||
          p.en.name.toLowerCase().includes(q) ||
          (p.ar?.name || "").toLowerCase().includes(q)
      )
    : products;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl text-[#0E2A47]">
          Products Inventory
          {products.length > 0 && (
            <span className="ml-2 align-middle font-sans text-sm text-[#1668C7]">
              {q && shown.length !== products.length ? `${shown.length} / ${products.length}` : products.length}
            </span>
          )}
        </h2>
        {canManage && !adding && !editing && (
          <button type="button" onClick={() => setAdding(true)} className={primaryBtn}>
            Add product
          </button>
        )}
      </div>

      <div className="mb-5 rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[#0E2A47]">Generate inventory list</span>
          <select
            className="rounded-full border border-[#0E2A47]/15 bg-white px-3 py-1.5 text-sm text-[#0E2A47] outline-none focus:border-[#1668C7]"
            value={reportFilter}
            onChange={(e) => setReportFilter(e.target.value as typeof reportFilter)}
          >
            <option value="all">All products</option>
            <option value="tracked">Tracked stock only</option>
            <option value="low">Low stock (≤10)</option>
            <option value="out">Out of stock</option>
          </select>
          <a className={primaryBtn} href={`/api/admin/catalog/report?format=pdf&filter=${reportFilter}`} target="_blank" rel="noreferrer">PDF</a>
          <a className={subtleBtn} href={`/api/admin/catalog/report?format=csv&filter=${reportFilter}`}>CSV</a>
          <span className="text-xs text-[#5B7186]">Point-in-time snapshot for audits &amp; record-keeping.</span>
        </div>
      </div>

      {!loadError && products.length > 0 && (
        <div className="relative mb-4">
          <input
            className={inputCls}
            placeholder="Search products by name or code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#5B7186] hover:text-[#0E2A47]"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {loadError ? (
        <div className="rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-6 py-5 text-sm text-[#CC4038]">
          {loadError}
        </div>
      ) : (
        <div className="space-y-4">
          {adding && (
            <ProductForm
              product={null}
              adminKey={adminKey}
              onSaved={handleCreated}
              onCancel={() => setAdding(false)}
            />
          )}
          {editing && (
            <ProductForm
              key={editing.slug}
              product={editing}
              adminKey={adminKey}
              onSaved={handleUpdated}
              onCancel={() => setEditingSlug(null)}
            />
          )}
          {products.length === 0 && !adding ? (
            <div className="rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">
              No products yet{canManage ? " — add the first one." : "."}
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">
              No products match “{query}”.
            </div>
          ) : (
            shown.map((product) => (
              <ProductRow
                key={product.slug}
                product={product}
                adminKey={adminKey}
                canManage={canManage}
                canEditStock={canEditStock}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
                onEdit={() => {
                  setAdding(false);
                  setEditingSlug(product.slug);
                }}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}
