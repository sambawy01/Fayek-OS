#!/usr/bin/env node
/**
 * Seeds the first Owner account from ADMIN_USER / ADMIN_PASS. No-ops if any
 * user already exists. The scrypt format MUST match src/lib/auth/password.ts.
 *
 *   ADMIN_USER=owner ADMIN_PASS='...' node --env-file=.env.local scripts/seed-owner.mjs
 */
import { randomBytes, scryptSync } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const cs = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!cs) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = neon(cs);

const N = 16384;
function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

const [{ n }] = await sql`SELECT count(*)::int AS n FROM users`;
if (n > 0) {
  console.log(`users already exist (${n}) — seed skipped`);
  process.exit(0);
}

const username = (process.env.ADMIN_USER || "owner").trim();
const password = process.env.ADMIN_PASS;
if (!password) { console.error("ADMIN_PASS not set"); process.exit(1); }

await sql`
  INSERT INTO users (username, name, role, password_hash)
  VALUES (${username}, 'Owner', 'owner', ${hashPassword(password)})
`;
console.log(`✓ seeded Owner "${username}"`);
