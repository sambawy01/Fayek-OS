# Fayek OS

Store back-office (admin only, no storefront): orders, inventory, finance/P&L,
POS, CRM, plus a Telegram owner-bot, cron reports, and inbound-email triage.
Next.js 16 App Router; **Vercel Blob is the datastore** (JSON docs, no SQL).
Admin is HTTP Basic Auth (`ADMIN_USER`/`ADMIN_PASS`) on `/admin` + `/api/admin/*`.
Every integration fails closed when its env vars are unset. See `README.md`.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
