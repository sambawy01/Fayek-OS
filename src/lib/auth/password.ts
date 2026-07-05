import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with Node's scrypt (no external dependency). NODE RUNTIME
 * ONLY — imported by the login route and the seed/user-admin paths, never by
 * the Edge middleware.
 *
 * Stored format: `scrypt$N$saltHex$hashHex`. N is the cost parameter, kept in
 * the string so it can be raised later without breaking old hashes.
 */
const N = 16384; // 2^14 CPU/memory cost
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const salt = Buffer.from(parts[2], "hex");
  const expected = Buffer.from(parts[3], "hex");
  if (!Number.isInteger(n) || salt.length === 0 || expected.length === 0) {
    return false;
  }
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length, { N: n, r: 8, p: 1 });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
