import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { setLeadStatus, type LeadStatus } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/admin/leads/[id] { status: approved|rejected|sent } */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("leads.manage");
  if ("error" in guard) return guard.error;
  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const allowed: LeadStatus[] = ["approved", "rejected", "sent", "pending"];
  if (typeof body.status !== "string" || !allowed.includes(body.status as LeadStatus)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  const lead = await setLeadStatus(Number((await params).id), body.status as LeadStatus);
  if (!lead) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ lead });
}
