-- Phase 2: company / customer accounts (B2B). The order-derived CRM stays for
-- insights; this is the stored customer entity with tax + registration details.

CREATE TABLE IF NOT EXISTS companies (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  tax_id         TEXT NOT NULL DEFAULT '',   -- الرقم الضريبي
  commercial_reg TEXT NOT NULL DEFAULT '',   -- السجل التجاري
  contact_name   TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  city           TEXT NOT NULL DEFAULT '',
  -- Owner/Admin-only fields (never returned to the Sales directory view):
  notes          TEXT NOT NULL DEFAULT '',
  payment_terms  TEXT NOT NULL DEFAULT '',   -- e.g. "Net 30" — used by receivables later
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_name_lower ON companies (lower(name));
