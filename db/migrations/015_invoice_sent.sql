-- Post-invoice lifecycle: record when the invoice document was marked sent to
-- the client (Invoice → sent → payment received → release).
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_sent_at TIMESTAMPTZ;
