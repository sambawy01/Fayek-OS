-- Phase 2: stock reservation + shortfall production.
-- When a PO is invoiced, its lines reserve available stock (so the same units
-- aren't promised to another order); the shortfall (ordered − available) raises
-- a factory production order. Available = on-hand − active reservations.
CREATE TABLE IF NOT EXISTS reservations (
  id          BIGSERIAL PRIMARY KEY,
  slug        TEXT NOT NULL,
  qty         INTEGER NOT NULL CHECK (qty > 0),
  po_id       BIGINT REFERENCES purchase_orders(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservations_slug_active_idx ON reservations (slug) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS reservations_po_idx ON reservations (po_id);

-- Products replenished externally (bought, not produced) — excluded from
-- shortfall production orders. Default off; editable later per item.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS frequent_supply BOOLEAN NOT NULL DEFAULT FALSE;
