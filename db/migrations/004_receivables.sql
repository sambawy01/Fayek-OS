-- Phase 4: receivables — credit sales with advances + installment schedules.

CREATE TABLE IF NOT EXISTS receivables (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL DEFAULT '',   -- snapshot
  order_ref    TEXT NOT NULL DEFAULT '',   -- POS/order number, if linked
  total_egp    INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','partial','paid','void')),
  due_date     DATE,
  notes        TEXT NOT NULL DEFAULT '',
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receivables_status ON receivables (status, created_at DESC);

CREATE TABLE IF NOT EXISTS receivable_payments (
  id            BIGSERIAL PRIMARY KEY,
  receivable_id BIGINT NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
  amount_egp    INTEGER NOT NULL,
  method        TEXT NOT NULL DEFAULT 'cash',
  kind          TEXT NOT NULL DEFAULT 'payment', -- advance | installment | payment
  note          TEXT NOT NULL DEFAULT '',
  paid_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by   BIGINT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS payments_receivable ON receivable_payments (receivable_id);

CREATE TABLE IF NOT EXISTS installments (
  id            BIGSERIAL PRIMARY KEY,
  receivable_id BIGINT NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  due_date      DATE,
  amount_egp    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS installments_receivable ON installments (receivable_id, seq);
