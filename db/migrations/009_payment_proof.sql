-- Every payment must be documented with a proof of payment (bank-transfer
-- receipt / cheque image or PDF, stored in Blob). Retail methods (cash, card,
-- InstaPay) are retired in the UI; bank transfer + cheque are the methods.
ALTER TABLE receivable_payments
  ADD COLUMN IF NOT EXISTS proof_url TEXT NOT NULL DEFAULT '';
