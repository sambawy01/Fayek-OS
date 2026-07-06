import { db } from "./db";
import { isoString } from "./db-dates";

export type LeadStatus = "reserve" | "pending" | "approved" | "rejected" | "sent";

export interface Lead {
  id: number;
  companyName: string;
  website: string;
  sector: string;
  location: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  rationale: string;
  relevantProducts: string[];
  draftSubject: string;
  draftBody: string;
  draftHtml: string;
  status: LeadStatus;
  source: string;
  domain: string;
  createdAt: string;
}

interface LeadRow {
  id: number; company_name: string; website: string; sector: string; location: string;
  contact_name: string; contact_email: string; contact_phone: string; rationale: string;
  relevant_products: string; draft_subject: string; draft_body: string; draft_html: string;
  status: string; source: string; domain: string; created_at: string;
}

function toLead(r: LeadRow): Lead {
  return {
    id: Number(r.id), companyName: r.company_name, website: r.website, sector: r.sector,
    location: r.location, contactName: r.contact_name, contactEmail: r.contact_email,
    contactPhone: r.contact_phone, rationale: r.rationale,
    relevantProducts: r.relevant_products ? r.relevant_products.split("\n").filter(Boolean) : [],
    draftSubject: r.draft_subject, draftBody: r.draft_body, draftHtml: r.draft_html,
    status: r.status as LeadStatus, source: r.source, domain: r.domain, createdAt: isoString(r.created_at),
  };
}

export interface NewLead {
  companyName: string;
  website?: string;
  sector?: string;
  location?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  rationale?: string;
  relevantProducts?: string[];
  draftSubject: string;
  draftBody: string;
  draftHtml: string;
  source?: string;
  domain?: string;
  /** Where the lead lands. Bulk stockpile runs pass "reserve"; default "pending". */
  status?: LeadStatus;
}

/** Insert a lead. De-dupes on domain (unique index) → returns null on conflict. */
export async function createLead(input: NewLead, createdBy: number | null): Promise<Lead | null> {
  const rows = (await db()`
    INSERT INTO leads (
      company_name, website, sector, location, contact_name, contact_email, contact_phone,
      rationale, relevant_products, draft_subject, draft_body, draft_html, status, source, domain, created_by
    ) VALUES (
      ${input.companyName}, ${input.website ?? ""}, ${input.sector ?? ""}, ${input.location ?? ""},
      ${input.contactName ?? ""}, ${input.contactEmail ?? ""}, ${input.contactPhone ?? ""},
      ${input.rationale ?? ""}, ${(input.relevantProducts ?? []).join("\n")},
      ${input.draftSubject}, ${input.draftBody}, ${input.draftHtml},
      ${input.status ?? "pending"}, ${input.source ?? "auto"}, ${input.domain ?? ""}, ${createdBy}
    )
    ON CONFLICT DO NOTHING
    RETURNING *
  `) as LeadRow[];
  return rows[0] ? toLead(rows[0]) : null;
}

/**
 * Leads for the Prospecting tab. With no `status`, the cached `reserve` pool is
 * hidden — those are surfaced only after the daily drip promotes them to pending.
 */
export async function listLeads(status?: LeadStatus): Promise<Lead[]> {
  const rows = status
    ? ((await db()`SELECT * FROM leads WHERE status = ${status} ORDER BY created_at DESC LIMIT 200`) as LeadRow[])
    : ((await db()`SELECT * FROM leads WHERE status <> 'reserve' ORDER BY created_at DESC LIMIT 200`) as LeadRow[]);
  return rows.map(toLead);
}

/** Size of the cached reserve pool (or any status). */
export async function countLeadsByStatus(status: LeadStatus): Promise<number> {
  const rows = (await db()`SELECT COUNT(*)::int AS n FROM leads WHERE status = ${status}`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/**
 * Promote up to `n` oldest reserve leads into the pending approval queue (FIFO),
 * stamping `released_at`. Returns the leads that were released.
 */
export async function releaseReserved(n: number): Promise<Lead[]> {
  if (n <= 0) return [];
  const rows = (await db()`
    UPDATE leads SET status = 'pending', released_at = now(), updated_at = now()
    WHERE id IN (
      SELECT id FROM leads WHERE status = 'reserve'
      ORDER BY created_at ASC LIMIT ${n}
    )
    RETURNING *
  `) as LeadRow[];
  return rows.map(toLead);
}

/** How many leads were dripped into the pending queue since `sinceIso`. */
export async function countReleasedSince(sinceIso: string): Promise<number> {
  const rows = (await db()`
    SELECT COUNT(*)::int AS n FROM leads WHERE released_at >= ${sinceIso}
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function getLead(id: number): Promise<Lead | null> {
  const rows = (await db()`SELECT * FROM leads WHERE id = ${id}`) as LeadRow[];
  return rows[0] ? toLead(rows[0]) : null;
}

export async function setLeadStatus(id: number, status: LeadStatus): Promise<Lead | null> {
  const rows = (await db()`
    UPDATE leads SET status = ${status}, updated_at = now() WHERE id = ${id} RETURNING *
  `) as LeadRow[];
  return rows[0] ? toLead(rows[0]) : null;
}

/** Domains already in the table (any status) — used to skip re-surfacing. */
export async function knownDomains(): Promise<Set<string>> {
  const rows = (await db()`SELECT domain FROM leads WHERE domain <> ''`) as { domain: string }[];
  return new Set(rows.map((r) => r.domain));
}

export async function countLeadsSince(sinceIso: string): Promise<number> {
  const rows = (await db()`
    SELECT COUNT(*)::int AS n FROM leads WHERE created_at >= ${sinceIso}
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}
