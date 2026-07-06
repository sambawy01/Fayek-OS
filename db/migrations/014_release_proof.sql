-- Proof-of-payment moves from invoicing to product release: releasing a PO's
-- goods to the warehouse now records the proof attached at release time. Owner/
-- Admin may waive it for a trusted key account (the reason goes in
-- dispatch_release_note), in which case this stays empty.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS dispatch_release_proof_url TEXT NOT NULL DEFAULT '';
