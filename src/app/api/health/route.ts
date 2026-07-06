import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public health check for uptime monitors and the CI smoke test. Verifies the
 * app is serving AND the database is reachable. Returns 200 only when healthy,
 * 503 otherwise, so a monitor can alert. No secrets, no data — safe to expose.
 */
export async function GET() {
  let dbOk = false;
  try {
    await db()`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const body = { ok: dbOk, db: dbOk, ts: new Date().toISOString() };
  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
