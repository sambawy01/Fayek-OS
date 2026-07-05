#!/usr/bin/env node
/**
 * Applies db/migrations/*.sql in order against the Neon/Postgres database, once
 * each, tracked in a `_migrations` table. Idempotent.
 *
 * Run locally (Node 22 loads .env.local):
 *   node --env-file=.env.local scripts/migrate.mjs
 *
 * The connection string comes from DATABASE_URL (fallback POSTGRES_URL).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const cs = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!cs) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const sql = neon(cs);

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

await sql`CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

const applied = new Set(
  (await sql`SELECT name FROM _migrations`).map((r) => r.name)
);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`· ${file} (already applied)`);
    continue;
  }
  const ddl = readFileSync(join(dir, file), "utf8");
  console.log(`→ applying ${file}…`);
  // neon() batches multiple statements when given raw SQL via .query? Use the
  // unsafe multi-statement path: split on statement boundaries is fragile, so
  // run the whole file as one call via the driver's transaction helper.
  await sql.transaction(
    ddl
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((stmt) => sql.query(stmt))
  );
  await sql`INSERT INTO _migrations (name) VALUES (${file})`;
  console.log(`  ✓ ${file}`);
}

console.log("migrations up to date");
