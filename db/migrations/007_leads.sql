-- Prospecting leads: AI-discovered potential customers with a drafted, branded
-- outreach awaiting human approval before it is sent.
CREATE TABLE IF NOT EXISTS leads (
  id             SERIAL PRIMARY KEY,
  company_name   TEXT NOT NULL,
  website        TEXT NOT NULL DEFAULT '',
  sector         TEXT NOT NULL DEFAULT '',
  location       TEXT NOT NULL DEFAULT '',
  contact_name   TEXT NOT NULL DEFAULT '',
  contact_email  TEXT NOT NULL DEFAULT '',
  contact_phone  TEXT NOT NULL DEFAULT '',
  -- Why this company is a fit + which of our products apply (AI research notes).
  rationale      TEXT NOT NULL DEFAULT '',
  relevant_products TEXT NOT NULL DEFAULT '',
  -- Drafted outreach awaiting approval.
  draft_subject  TEXT NOT NULL DEFAULT '',
  draft_body     TEXT NOT NULL DEFAULT '',
  draft_html     TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','sent')),
  source         TEXT NOT NULL DEFAULT 'auto',
  -- Domain used to de-duplicate across daily runs.
  domain         TEXT NOT NULL DEFAULT '',
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS leads_domain_uidx ON leads (domain) WHERE domain <> '';
