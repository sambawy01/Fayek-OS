-- Phase 3: factory batches dispatched to the warehouse, inventory receiving,
-- and the approvals/escalations that discrepancies raise.

CREATE TABLE IF NOT EXISTS batches (
  id           BIGSERIAL PRIMARY KEY,
  reference    TEXT NOT NULL DEFAULT '',   -- factory dispatch note / PO ref
  supplier     TEXT NOT NULL DEFAULT '',   -- factory / supplier name
  -- dispatched: declared, awaiting receipt
  -- received:   counted, no discrepancy, stock added
  -- pending_approval: discrepancy raised, awaiting owner/admin decision
  -- resolved:   discrepancy accepted, stock added
  -- rejected:   discrepancy rejected, no stock change
  status       TEXT NOT NULL DEFAULT 'dispatched'
               CHECK (status IN ('dispatched','received','pending_approval','resolved','rejected')),
  notes        TEXT NOT NULL DEFAULT '',
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  received_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_lines (
  id           BIGSERIAL PRIMARY KEY,
  batch_id     BIGINT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,              -- catalog product slug
  name         TEXT NOT NULL DEFAULT '',   -- snapshot of the product name
  expected_qty INTEGER NOT NULL DEFAULT 0,
  received_qty INTEGER                     -- null until received
);
CREATE INDEX IF NOT EXISTS batch_lines_batch ON batch_lines (batch_id);

CREATE TABLE IF NOT EXISTS approvals (
  id            BIGSERIAL PRIMARY KEY,
  type          TEXT NOT NULL DEFAULT 'batch_discrepancy',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  ref_batch_id  BIGINT REFERENCES batches(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  detail        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- structured context (line diffs)
  ai_recommendation TEXT NOT NULL DEFAULT '',
  raised_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decided_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS approvals_status ON approvals (status, created_at DESC);
