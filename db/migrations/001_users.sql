-- Phase 0: users + roles. Session tokens are stateless (signed JWTs), so no
-- sessions table is needed.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'inventory', 'sales')),
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique username.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));
