-- Prospecting stockpile: leads discovered + drafted in bulk but not yet surfaced
-- for approval. One expensive web-search + AI discovery run fills a "reserve"
-- pool; a cheap daily drip promotes reserve -> pending a few at a time, so
-- discovery runs occasionally instead of every day.
--
-- `released_at` stamps when a reserve lead is dripped into the pending queue, so
-- the daily cron's "already ran today" check counts drips (not creations) and
-- stays correct even right after a big stockpile run.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('reserve','pending','approved','rejected','sent'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS leads_reserve_idx ON leads (status, created_at) WHERE status = 'reserve';
