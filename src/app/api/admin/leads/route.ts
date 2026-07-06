import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import {
  listLeads,
  releaseReserved,
  countLeadsByStatus,
  type LeadStatus,
} from "@/lib/leads";
import { discoverAndDraftLeads } from "@/lib/prospecting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // discovery does several web calls + AI drafts

const STOCKPILE_TARGET = 30; // one extensive run tops the cached pool up to here

/** GET /api/admin/leads?status=pending — prospecting leads (+ reserve pool size). */
export async function GET(request: Request) {
  const guard = await requireCapability("leads.manage");
  if ("error" in guard) return guard.error;
  const s = new URL(request.url).searchParams.get("status");
  const valid = ["pending", "approved", "rejected", "sent"];
  const status = s && valid.includes(s) ? (s as LeadStatus) : undefined;
  const [leads, reserveCount] = await Promise.all([
    listLeads(status),
    countLeadsByStatus("reserve"),
  ]);
  return NextResponse.json({ leads, reserveCount });
}

/**
 * POST /api/admin/leads
 * - { action: "run", count? }       — live-discover leads straight into pending.
 * - { action: "stockpile", count? } — extensive run that fills the cached reserve pool.
 * - { action: "release", count? }   — drip `count` (default 4) reserve → pending now.
 */
export async function POST(request: Request) {
  const guard = await requireCapability("leads.run");
  if ("error" in guard) return guard.error;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* empty body is fine */
  }
  const action = body.action;

  if (action === "release") {
    const count = typeof body.count === "number" ? Math.min(20, Math.max(1, Math.round(body.count))) : 4;
    const released = await releaseReserved(count);
    const reserveCount = await countLeadsByStatus("reserve");
    return NextResponse.json({ released, reserveCount });
  }

  if (action === "stockpile" || action === "run") {
    const toReserve = action === "stockpile";
    const have = toReserve ? await countLeadsByStatus("reserve") : 0;
    const count = toReserve
      ? Math.max(0, (typeof body.count === "number" ? Math.round(body.count) : STOCKPILE_TARGET) - have)
      : typeof body.count === "number"
        ? Math.min(8, Math.max(1, Math.round(body.count)))
        : 4;
    const result = await discoverAndDraftLeads(count, guard.user.uid, {
      status: toReserve ? "reserve" : "pending",
      ...(toReserve ? { perSector: 15 } : {}),
    });
    if (!result.webSearchConfigured) {
      return NextResponse.json(
        { error: "Web search isn't configured. Set TAVILY_API_KEY to enable prospecting.", ...result },
        { status: 400 }
      );
    }
    const reserveCount = await countLeadsByStatus("reserve");
    return NextResponse.json({ ...result, reserveCount });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
