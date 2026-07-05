import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { listLeads, type LeadStatus } from "@/lib/leads";
import { discoverAndDraftLeads } from "@/lib/prospecting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // discovery does several web calls + AI drafts

/** GET /api/admin/leads?status=pending — prospecting leads. */
export async function GET(request: Request) {
  const guard = await requireCapability("leads.manage");
  if ("error" in guard) return guard.error;
  const s = new URL(request.url).searchParams.get("status");
  const valid = ["pending", "approved", "rejected", "sent"];
  const status = s && valid.includes(s) ? (s as LeadStatus) : undefined;
  return NextResponse.json({ leads: await listLeads(status) });
}

/** POST /api/admin/leads { action: "run", count? } — run discovery now. */
export async function POST(request: Request) {
  const guard = await requireCapability("leads.run");
  if ("error" in guard) return guard.error;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* empty body is fine */
  }
  if (body.action !== "run") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  const count = typeof body.count === "number" ? Math.min(8, Math.max(1, Math.round(body.count))) : 4;
  const result = await discoverAndDraftLeads(count, guard.user.uid);
  if (!result.webSearchConfigured) {
    return NextResponse.json(
      { error: "Web search isn't configured. Set TAVILY_API_KEY to enable prospecting.", ...result },
      { status: 400 }
    );
  }
  return NextResponse.json(result);
}
