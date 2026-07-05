# Fayek OS

The **back-office / operations platform** for a small retail store — finance,
inventory, point-of-sale, orders and CRM in one Next.js app. No storefront:
this is the owner-facing admin only.

It was extracted from the `justmanalized-platform` project (the storefront and
its public order/product/concierge APIs were removed) and genericized into a
reusable store back-office.

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
locked (fails closed). A missing catalog blob seeds three neutral **sample
products** so the dashboard renders on a fresh deployment — edit or replace them
from `/admin`.

## Deploy

Deploy on **Vercel**. Required env: `ADMIN_USER`, `ADMIN_PASS`,
`BLOB_READ_WRITE_TOKEN` (create a Blob store in the dashboard). Add the optional
integration vars from `.env.example` as you enable each feature — everything
fails closed, so partial config is fine.

Cron schedules live in `vercel.json` (times are **UTC**). Note the Vercel Hobby
plan limits cron frequency/count; trim `vercel.json` to fit your plan.

## Notes for whoever rebrands this

The genericization kept the base data model intact where ripping it out would be
risky. Known items to revisit:

- **Currency**: prices are **EGP** (`priceEgp`). A second currency (`priceRub`)
  and a second language (`ru`) exist in the schema but are **dormant** (RU
  mirrors EN, `priceRub` stays 0) — enable them without a data-model change, or
  strip them for a single-currency store.
- **Logo assets**: `public/logo.png` and `public/assets/logo-*.png` are carried
  over from the source project and used in emails/PDF letterheads. Replace them
  with your own artwork.
- Timezone is hard-coded to **Africa/Cairo** for reports (`CAIRO_TZ`).
