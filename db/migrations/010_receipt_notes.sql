-- Warehouse receipt comments (condition of goods, damage, shortages, etc.),
-- written by the receiver when confirming a batch — separate from the factory's
-- dispatch notes.
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS receipt_notes TEXT NOT NULL DEFAULT '';
