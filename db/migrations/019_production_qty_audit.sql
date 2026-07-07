-- Qty-edit at approval: preserve the algorithm's original quantity so an
-- owner's override becomes a tuning signal (how far, and how often, the human
-- disagrees with auto_reorder / invoice_shortfall sizing). `qty` stays the
-- working/approved value; `suggested_qty` is frozen at creation time. For
-- invoice_shortfall orders it also carries the committed shortfall floor that
-- the approval UI warns against dropping below.
ALTER TABLE production_orders
  ADD COLUMN IF NOT EXISTS suggested_qty INTEGER;

-- Backfill existing open/undecided orders so the audit is complete.
UPDATE production_orders SET suggested_qty = qty WHERE suggested_qty IS NULL;
