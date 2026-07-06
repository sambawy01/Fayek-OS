-- Production orders get a deadline (for the countdown UI + overdue tracking).
ALTER TABLE production_orders
  ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;
