import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Postgres (Vercel/Neon) access. The Neon serverless driver runs over HTTP, so
 * it works in both the Node and Edge runtimes. `db()` is a lazily-created,
 * memoized tagged-template query function:
 *
 *   const rows = await db()`SELECT * FROM users WHERE id = ${id}`;
 *
 * `${…}` interpolations are sent as bound parameters (no SQL injection). The
 * connection string comes from the Neon integration's env (DATABASE_URL, with
 * POSTGRES_URL as a fallback name).
 */
let client: NeonQueryFunction<false, false> | undefined;

export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const cs = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!cs) {
      throw new Error(
        "DATABASE_URL is not set — the Postgres (Neon) integration must be connected."
      );
    }
    client = neon(cs);
  }
  return client;
}
