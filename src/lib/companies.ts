import { db } from "./db";

/**
 * Company / customer accounts (Postgres). Two projections:
 * - CompanyDirectory: the safe fields the Sales role may see (pick / create a
 *   customer mid-sale). NO notes, payment terms, or audit fields.
 * - Company: the full account (Owner/Admin).
 */
export interface CompanyDirectory {
  id: number;
  name: string;
  taxId: string;
  commercialReg: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  active: boolean;
}

export interface Company extends CompanyDirectory {
  address: string;
  notes: string;
  paymentTerms: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyInput {
  name: string;
  taxId?: string;
  commercialReg?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  paymentTerms?: string;
  active?: boolean;
}

interface Row {
  id: number;
  name: string;
  tax_id: string;
  commercial_reg: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes: string;
  payment_terms: string;
  active: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

function toDirectory(r: Row): CompanyDirectory {
  return {
    id: Number(r.id),
    name: r.name,
    taxId: r.tax_id,
    commercialReg: r.commercial_reg,
    contactName: r.contact_name,
    phone: r.phone,
    email: r.email,
    city: r.city,
    active: r.active,
  };
}

function toCompany(r: Row): Company {
  return {
    ...toDirectory(r),
    address: r.address,
    notes: r.notes,
    paymentTerms: r.payment_terms,
    createdBy: r.created_by === null ? null : Number(r.created_by),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Directory list, newest first, optionally filtered by a search term. */
export async function listCompanies(search = ""): Promise<CompanyDirectory[]> {
  const q = search.trim();
  const rows = q
    ? ((await db()`
        SELECT * FROM companies
         WHERE active = TRUE
           AND (name ILIKE ${"%" + q + "%"}
             OR tax_id ILIKE ${"%" + q + "%"}
             OR commercial_reg ILIKE ${"%" + q + "%"}
             OR contact_name ILIKE ${"%" + q + "%"}
             OR phone ILIKE ${"%" + q + "%"})
         ORDER BY name
         LIMIT 50
      `) as Row[])
    : ((await db()`
        SELECT * FROM companies WHERE active = TRUE ORDER BY name LIMIT 100
      `) as Row[]);
  return rows.map(toDirectory);
}

export async function getCompany(id: number): Promise<Company | null> {
  const rows = (await db()`SELECT * FROM companies WHERE id = ${id} LIMIT 1`) as Row[];
  return rows[0] ? toCompany(rows[0]) : null;
}

export async function createCompany(
  input: CompanyInput,
  createdBy: number | null
): Promise<Company> {
  const rows = (await db()`
    INSERT INTO companies
      (name, tax_id, commercial_reg, contact_name, phone, email, address, city,
       notes, payment_terms, created_by)
    VALUES
      (${input.name.trim()}, ${input.taxId ?? ""}, ${input.commercialReg ?? ""},
       ${input.contactName ?? ""}, ${input.phone ?? ""}, ${input.email ?? ""},
       ${input.address ?? ""}, ${input.city ?? ""}, ${input.notes ?? ""},
       ${input.paymentTerms ?? ""}, ${createdBy})
    RETURNING *
  `) as Row[];
  return toCompany(rows[0]);
}

export async function updateCompany(
  id: number,
  patch: Partial<CompanyInput>
): Promise<Company | null> {
  const cur = await getCompany(id);
  if (!cur) return null;
  const m = {
    name: patch.name !== undefined ? patch.name.trim() : cur.name,
    taxId: patch.taxId ?? cur.taxId,
    commercialReg: patch.commercialReg ?? cur.commercialReg,
    contactName: patch.contactName ?? cur.contactName,
    phone: patch.phone ?? cur.phone,
    email: patch.email ?? cur.email,
    address: patch.address ?? cur.address,
    city: patch.city ?? cur.city,
    notes: patch.notes ?? cur.notes,
    paymentTerms: patch.paymentTerms ?? cur.paymentTerms,
    active: patch.active ?? cur.active,
  };
  const rows = (await db()`
    UPDATE companies SET
      name = ${m.name}, tax_id = ${m.taxId}, commercial_reg = ${m.commercialReg},
      contact_name = ${m.contactName}, phone = ${m.phone}, email = ${m.email},
      address = ${m.address}, city = ${m.city}, notes = ${m.notes},
      payment_terms = ${m.paymentTerms}, active = ${m.active}, updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `) as Row[];
  return rows[0] ? toCompany(rows[0]) : null;
}
