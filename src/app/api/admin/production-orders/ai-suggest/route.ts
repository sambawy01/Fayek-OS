import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { aiSuggestProduction } from "@/lib/ai-production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // the model call can take a while

/** POST /api/admin/production-orders/ai-suggest — AI production recommendations. */
export async function POST() {
  const guard = await requireCapability("production.manage");
  if ("error" in guard) return guard.error;
  const result = await aiSuggestProduction();
  return NextResponse.json(result);
}
