-- Sales module: quotations and purchase orders (customer POs).

CREATE TABLE IF NOT EXISTS quotations (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','sent','accepted','expired','converted')),
  valid_until  DATE,
  notes        TEXT NOT NULL DEFAULT '',
  total_egp    INTEGER NOT NULL DEFAULT 0,
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quotation_lines (
  id            BIGSERIAL PRIMARY KEY,
  quotation_id  BIGINT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL DEFAULT '',
  qty           INTEGER NOT NULL DEFAULT 1,
  unit_price_egp INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS quotation_lines_q ON quotation_lines (quotation_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            BIGSERIAL PRIMARY KEY,
  company_id    BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  company_name  TEXT NOT NULL DEFAULT '',
  quotation_id  BIGINT REFERENCES quotations(id) ON DELETE SET NULL,
  -- open: awaiting processing · fulfilled: stock deducted · invoiced: receivable
  -- raised · closed: done · cancelled
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','fulfilled','invoiced','closed','cancelled')),
  total_egp     INTEGER NOT NULL DEFAULT 0,
  notes         TEXT NOT NULL DEFAULT '',
  fulfilled     BOOLEAN NOT NULL DEFAULT FALSE,
  receivable_id BIGINT REFERENCES receivables(id) ON DELETE SET NULL,
  created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS po_status ON purchase_orders (status, created_at DESC);
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id             BIGSERIAL PRIMARY KEY,
  po_id          BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL DEFAULT '',
  qty            INTEGER NOT NULL DEFAULT 1,
  unit_price_egp INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS po_lines_po ON purchase_order_lines (po_id);
