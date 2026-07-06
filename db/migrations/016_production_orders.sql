-- Phase 1: reorder automation + factory production orders.
-- Each product has a reorder point (min on-hand before we produce) and a reorder
-- quantity (how much to produce). When tracked stock drops to/below the point, a
-- factory production order is auto-created for Owner/Admin approval; approved
-- orders become the factory production queue and are produced via the existing
-- batch (dispatch → receive → stock) flow.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS reorder_point INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS reorder_qty   INTEGER NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS production_orders (
  id          BIGSERIAL PRIMARY KEY,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',      -- snapshot of the product name
  qty         INTEGER NOT NULL CHECK (qty > 0),
  status      TEXT NOT NULL DEFAULT 'pending_approval'
              CHECK (status IN ('pending_approval','approved','in_production','done','rejected','cancelled')),
  reason      TEXT NOT NULL DEFAULT 'manual'
              CHECK (reason IN ('auto_reorder','manual','invoice_shortfall')),
  note        TEXT NOT NULL DEFAULT '',
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decided_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decided_at  TIMESTAMPTZ,
  batch_id    BIGINT REFERENCES batches(id) ON DELETE SET NULL,  -- the dispatch that fulfils it
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_orders_status_idx ON production_orders (status, created_at DESC);
-- At most ONE active production order per product (dedupes auto-reorders and
-- blocks duplicate manual orders while one is still open).
CREATE UNIQUE INDEX IF NOT EXISTS production_orders_open_slug_idx
  ON production_orders (slug) WHERE status IN ('pending_approval','approved','in_production');
