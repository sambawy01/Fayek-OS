import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import {
  getCompany,
  updateCompany,
  type CompanyInput,
} from "@/lib/companies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET/PATCH one company's FULL account (address, notes, payment terms). Requires
 * customers.account (owner/admin) — Sales uses the directory list only.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("customers.account");
  if ("error" in guard) return guard.error;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Bad id." }, { status: 400 });
  }
  const company = await getCompany(id);
  if (!company) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ company });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("customers.account");
  if ("error" in guard) return guard.error;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Bad id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const patch: Partial<CompanyInput> = {};
  const fields: (keyof CompanyInput)[] = [
    "name", "taxId", "commercialReg", "contactName", "phone", "email",
    "address", "city", "notes", "paymentTerms",
  ];
  for (const f of fields) {
    if (typeof body[f] === "string") {
      (patch as Record<string, string>)[f] = (body[f] as string).trim();
    }
  }
  if (typeof body.active === "boolean") patch.active = body.active;
  if (patch.name !== undefined && patch.name.length < 2) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }

  const company = await updateCompany(id, patch);
  if (!company) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ company });
}
