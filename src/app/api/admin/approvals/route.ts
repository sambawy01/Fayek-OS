import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { listApprovals } from "@/lib/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/approvals?status=pending — approvals.resolve (owner/admin). */
export async function GET(request: Request) {
  const guard = await requireCapability("approvals.resolve");
  if ("error" in guard) return guard.error;
  const status = new URL(request.url).searchParams.get("status");
  const approvals = await listApprovals(
    status === "approved" || status === "rejected" || status === "pending"
      ? status
      : undefined
  );
  return NextResponse.json({ approvals });
}
