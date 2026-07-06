-- Move the product catalogue (including on-hand stock) out of the single Vercel
-- Blob JSON and into Postgres, so stock changes become atomic, row-locked
-- UPDATEs instead of read-modify-write over one file (which loses concurrent
-- updates). The blob remains as a backup; this table is the source of truth.
CREATE TABLE IF NOT EXISTS products (
  slug        TEXT PRIMARY KEY,
  name_en     TEXT NOT NULL DEFAULT '',
  sub_en      TEXT NOT NULL DEFAULT '',
  desc_en     TEXT NOT NULL DEFAULT '',
  name_ar     TEXT NOT NULL DEFAULT '',
  sub_ar      TEXT NOT NULL DEFAULT '',
  desc_ar     TEXT NOT NULL DEFAULT '',
  price_egp   INTEGER NOT NULL DEFAULT 0,
  photo       TEXT NOT NULL DEFAULT '',
  alt_en      TEXT NOT NULL DEFAULT '',
  alt_ar      TEXT NOT NULL DEFAULT '',
  -- NULL = stock not tracked; a non-null value floors at 0 (auto sold-out).
  quantity    INTEGER,
  sold_out    BOOLEAN NOT NULL DEFAULT FALSE,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  usage_en    TEXT NOT NULL DEFAULT '',
  usage_ar    TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
