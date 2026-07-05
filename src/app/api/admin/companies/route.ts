import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { listCompanies, createCompany, type CompanyInput } from "@/lib/companies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/companies?search=…  — the customer directory (safe fields).
 * POST /api/admin/companies           — create a customer.
 * Both require customers.directory (owner / admin / sales). Note/payment-term
 * fields are only accepted here from owner/admin (customers.account).
 */
export async function GET(request: Request) {
  const guard = await requireCapability("customers.directory");
  if ("error" in guard) return guard.error;
  const search = new URL(request.url).searchParams.get("search") ?? "";
  const companies = await listCompanies(search);
  return NextResponse.json({ companies });
}

export async function POST(request: Request) {
  const guard = await requireCapability("customers.directory");
  if ("error" in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const name = str("name");
  if (name.length < 2) {
    return NextResponse.json(
      { error: "Company name is required." },
      { status: 400 }
    );
  }

  const input: CompanyInput = {
    name,
    taxId: str("taxId"),
    commercialReg: str("commercialReg"),
    contactName: str("contactName"),
    phone: str("phone"),
    email: str("email"),
    address: str("address"),
    city: str("city"),
  };
  // Only owner/admin (customers.account) may set the private fields.
  const canAccount = guard.user.role === "owner" || guard.user.role === "admin";
  if (canAccount) {
    input.notes = str("notes");
    input.paymentTerms = str("paymentTerms");
  }

  const company = await createCompany(input, guard.user.uid);
  // Return the directory projection (safe for any creator).
  return NextResponse.json(
    {
      company: {
        id: company.id,
        name: company.name,
        taxId: company.taxId,
        commercialReg: company.commercialReg,
        contactName: company.contactName,
        phone: company.phone,
        email: company.email,
        city: company.city,
        active: company.active,
      },
    },
    { status: 201 }
  );
}
