/**
 * Daily prospecting agent. Discovers potential customers via web search across
 * rotating industrial sectors in Egypt, researches each company's site, drafts a
 * tailored branded outreach email, and stores it as a `pending` lead for human
 * approval. De-dupes by domain so the same company is never surfaced twice.
 *
 * Requires TAVILY_API_KEY (web search) and OLLAMA_API_KEY (drafting). Fails soft:
 * when web search isn't configured it returns an empty result with a reason.
 */
import { getCatalog } from "./catalog";
import { catalogSummaryForAI, draftOutreach } from "./ai-sales";
import {
  webSearch, webExtract, isCompanySite, hostOf, scrapeContacts, webSearchConfigured,
} from "./websearch";
import { brandedOutreachHtml } from "./outreach-email";
import { createLead, knownDomains, type Lead, type LeadStatus } from "./leads";

const SECTORS: { name: string; query: string }[] = [
  { name: "Pharmaceutical manufacturing", query: "pharmaceutical manufacturer factory Egypt" },
  { name: "Food & beverage manufacturing", query: "food and beverage manufacturer factory Egypt" },
  { name: "Bottled water & beverages", query: "bottled water beverage bottling company Egypt" },
  { name: "Paints & coatings", query: "paints and coatings manufacturer Egypt" },
  { name: "Water & wastewater treatment", query: "industrial water treatment company Egypt" },
  { name: "Metal fabrication & steel", query: "metal fabrication steel factory Egypt" },
  { name: "Automotive & parts", query: "automotive parts manufacturer factory Egypt" },
  { name: "Chemicals", query: "chemical manufacturer factory Egypt" },
  { name: "Textiles", query: "textile manufacturer factory Egypt" },
  { name: "Ceramics & building materials", query: "ceramics and building materials manufacturer Egypt" },
];

export interface ProspectingResult {
  created: Lead[];
  scanned: number;
  skipped: number;
  webSearchConfigured: boolean;
  reason?: string;
}

/** Best-effort company name from a search-result title, else the domain root. */
function cleanName(title: string, domain: string): string {
  const first = (title || "").split(/[|\-–—:·]/)[0].trim();
  const stripped = first.replace(/^(welcome to|home ?-?|homepage)\s*/i, "").trim();
  if (stripped.length >= 2 && stripped.length <= 60) return stripped;
  const root = domain.split(".")[0] || "the company";
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function fallbackBody(company: string, sector: string): string {
  return (
    `Dear ${company} team,\n\n` +
    `I'm reaching out from Fayek Abrasives, an industrial abrasives and filtration ` +
    `supplier in Cairo (since 1997). We work with ${sector.toLowerCase()} operations ` +
    `to improve product quality and reduce cost through reliable, locally stocked ` +
    `abrasives and filtration consumables with short lead times.\n\n` +
    `Could I share our catalogue or prepare a tailored quotation for your line?`
  );
}

export interface DiscoverOptions {
  dayIndex?: number;
  /** Where new leads land: "pending" surfaces immediately, "reserve" caches them. */
  status?: LeadStatus;
  /** Search results fetched per sector. Bulk stockpile runs pass a wider net. */
  perSector?: number;
}

export async function discoverAndDraftLeads(
  count = 4,
  createdBy: number | null,
  opts: DiscoverOptions = {}
): Promise<ProspectingResult> {
  if (!webSearchConfigured()) {
    return { created: [], scanned: 0, skipped: 0, webSearchConfigured: false, reason: "TAVILY_API_KEY not set" };
  }

  const status: LeadStatus = opts.status ?? "pending";
  // Enough candidates per sector to cover the target after de-dup/filtering.
  const perSector =
    opts.perSector ?? Math.min(20, Math.max(8, Math.ceil((count * 2) / SECTORS.length) + 6));

  const seen = await knownDomains();
  const products = await getCatalog();
  const catalog = catalogSummaryForAI(products);

  // Rotate sectors so successive runs cover different industries.
  const offset = (opts.dayIndex ?? Math.floor(Date.now() / 86_400_000)) % SECTORS.length;
  const ordered = [...SECTORS.slice(offset), ...SECTORS.slice(0, offset)];

  const created: Lead[] = [];
  let scanned = 0, skipped = 0;

  for (const sector of ordered) {
    if (created.length >= count) break;
    const hits = await webSearch(sector.query, { maxResults: perSector });
    for (const hit of hits) {
      if (created.length >= count) break;
      if (!isCompanySite(hit.url)) { skipped++; continue; }
      const domain = hostOf(hit.url);
      if (!domain || seen.has(domain)) { skipped++; continue; }
      seen.add(domain);

      try {
        scanned++;
        // Research the company site (full extract, falling back to the snippet).
        let research = hit.content ?? "";
        const pages = await webExtract([hit.url]);
        const raw = Object.values(pages).join("\n\n");
        if (raw) research = raw;
        const contacts = scrapeContacts(research);
        const company = cleanName(hit.title, domain);

        const draft = await draftOutreach({
          companyName: company,
          research,
          brief: `Industry: ${sector.name}. This is a first-touch cold prospecting email.`,
          catalogSummary: catalog,
          fallbackSubject: `Partnering with ${company} — Fayek Abrasives`,
          fallbackBody: fallbackBody(company, sector.name),
        });
        const html = brandedOutreachHtml(draft.subject, draft.body, "");

        const lead = await createLead(
          {
            companyName: company,
            website: hit.url,
            sector: sector.name,
            location: "Egypt",
            contactEmail: contacts.email,
            contactPhone: contacts.phone,
            rationale: draft.rationale,
            relevantProducts: draft.relevantProducts,
            draftSubject: draft.subject,
            draftBody: draft.body,
            draftHtml: html,
            source: "auto",
            domain,
            status,
          },
          createdBy
        );
        if (lead) created.push(lead);
        else skipped++;
      } catch {
        skipped++;
      }
    }
  }

  return { created, scanned, skipped, webSearchConfigured: true };
}
