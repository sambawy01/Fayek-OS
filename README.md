# Fayek Abrasives

The **back-office / operations platform** for **Fayek Abrasives (FTC)** — an
industrial abrasives & filtration supplier in Cairo, Egypt (since 1997) —
covering finance, inventory, point-of-sale, orders and CRM in one Next.js app.
No storefront: this is the owner-facing admin only.

The catalog is seeded from the company's own stock sheet (157 line items with
real on-hand quantities). It was extracted from the `justmanalized-platform`
project (the storefront and its public order/product/concierge APIs were
removed) and customized for Fayek Abrasives.

- **Web:** www.fayekabrasives.com · **Contact:** info@ftc-eg.com · +20 2 2415 6092
- **Currency:** EGP · **Timezone:** Africa/Cairo

## What's inside

**Web dashboard** at `/admin` (HTTP Basic Auth):

- **Orders** — list, look up, and advance order status
  (ordered → confirmed → shipped → delivered, or cancel with a reason).
- **Products / Inventory** — the catalog with per-product **stock quantity
  tracking**, prices, sold-out flags, photos, and manufacturer usage notes.
  Auto sold-out when tracked stock hits 0.
- **Finance** — a private income/expense ledger, **Profit & Loss** for any
  period, and CSV / PDF (letterhead) export.
- **Clients (CRM)** — customer profiles derived automatically from orders:
  total spend, history, private notes and tags.
- **POS** at `/admin/pos` — a touch point-of-sale for in-person sales. It posts
  to `POST /api/admin/orders`, records the sale as paid revenue, and decrements
  stock for catalog items. Supports store-only (off-catalog) items too.

**Automation layer:**

- **Telegram owner-bot "Fayek"** (`/api/telegram/webhook`) — a private ops
  assistant: query orders/finances, record in-store sales, edit the catalog,
  log expenses, generate P&L PDFs, draft customer emails. Understands voice
  notes and photos (receipts → expense, product photos → catalog). Every
  mutating action waits for an in-chat confirmation button.
- **Cron jobs** (`/api/cron/*`) — daily brief, evening digest, weekly report,
  monthly P&L, and a nightly backup of the Blob store.
- **Inbound email triage** (`/api/email/inbound`) — a Resend inbound webhook;
  the assistant drafts a reply and pushes it to the owner for approval.

## Tech stack

- **Next.js 16** (App Router) + React 19, TypeScript, Tailwind CSS 4.
- **Vercel Blob** as the datastore — orders, catalog, CRM, finance ledger and
  backups are JSON documents in a private Blob store. No SQL database.
- **Auth** — HTTP Basic Auth (`ADMIN_USER` / `ADMIN_PASS`) on `/admin` and every
  `/api/admin/*` route, plus a legacy static key. All comparisons constant-time.
- Optional integrations: **Resend** (email), **Telegram** (bot), **Ollama
  Cloud** (assistant reasoning + vision), **Groq Whisper** (voice).

## Getting started

```bash
cp .env.example .env.local   # fill in at least ADMIN_* and BLOB_READ_WRITE_TOKEN
npm install
npm run dev                  # http://localhost:3000 -> redirects to /admin
```

`/` redirects to `/admin`. With no `ADMIN_USER`/`ADMIN_PASS` set, admin is
locked (fails closed). On a fresh deployment the catalog is seeded from the
company stock sheet (`src/lib/shop-products.ts` — 157 items with real on-hand
quantities); once you save any change in `/admin`, the live Blob catalog takes
over and the seed is never read again.

> **Prices are cost figures.** `priceEgp` comes from the stock sheet's EGP
> column, which is labelled *product cost* — not a margin-loaded selling price.
> Review and set real prices in `/admin` before quoting customers.

## Deploy

Deploy on **Vercel**. Required env: `ADMIN_USER`, `ADMIN_PASS`,
`BLOB_READ_WRITE_TOKEN` (create a Blob store in the dashboard). Add the optional
integration vars from `.env.example` as you enable each feature — everything
fails closed, so partial config is fine.

Cron schedules live in `vercel.json` (times are **UTC**). Note the Vercel Hobby
plan limits cron frequency/count; trim `vercel.json` to fit your plan.

## Notes for whoever rebrands this

Notes on the localization and known items to revisit:

- **Currency**: single-currency **EGP** (`priceEgp`). The Russian ruble second
  currency was removed.
- **Languages**: bilingual **English + Arabic** (`en` / `ar` on products, orders
  and customer emails). Arabic fields are optional in `/admin` and fall back to
  the English values, so you can run English-only and add Arabic per product.
- **Arabic in PDFs**: the letterhead/document PDF generator embeds Latin fonts
  only — Arabic text in generated PDFs will not shape correctly yet. Email/HTML
  and the admin UI render Arabic fine; embedding an Arabic (RTL-shaping) font in
  `src/lib/assistant/letterhead-pdf.ts` is the follow-up if you need Arabic PDFs.
- **Logo assets**: `public/logo.png` and `public/assets/logo-*.png` are carried
  over from the source project and used in emails/PDF letterheads. Replace them
  with your own artwork.
- Timezone is hard-coded to **Africa/Cairo** for reports (`CAIRO_TZ`).
