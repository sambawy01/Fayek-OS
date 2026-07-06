-- Product Release Form: Finance formally releases an invoiced PO's goods to the
-- warehouse/inventory for dispatch to the client. Records who released it, when,
-- and an optional authorization note. The existing dispatch_requested flag still
-- drives the warehouse queue; these columns back the printable release form.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS dispatch_released_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_released_by  INTEGER,
  ADD COLUMN IF NOT EXISTS dispatch_release_note TEXT NOT NULL DEFAULT '';
