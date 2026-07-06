-- Client dispatch handoff: Finance marks an (invoiced/settled) purchase order as
-- ready for the warehouse to dispatch to the client. Inventory then confirms the
-- dispatch, which deducts stock (the existing fulfilment).
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS dispatch_requested BOOLEAN NOT NULL DEFAULT FALSE;
