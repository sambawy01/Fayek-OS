/**
 * Web search + page extraction via Tavily (https://tavily.com) — a search API
 * built for AI agents (returns clean, LLM-ready content). Powers the outreach
 * "Personalize with AI" research and the daily prospecting agent.
 *
 * Fails soft: every function returns an empty result when TAVILY_API_KEY is
 * unset or the call fails, so callers degrade gracefully (and can tell the user
 * "web search unavailable" instead of crashing).
 */

const SEARCH_URL = "https://api.tavily.com/search";
const EXTRACT_URL = "https://api.tavily.com/extract";

export interface SearchHit {
  title: string;
  url: string;
  content: string;
  rawContent?: string;
}

export function webSearchConfigured(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

/** Directory/aggregator hosts that are rarely the company's own site. */
const NON_COMPANY_HOSTS = [
  "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com",
  "youtube.com", "wikipedia.org", "yellowpages", "yelp.com", "indeed.com",
  "glassdoor", "crunchbase.com", "zoominfo.com", "alibaba.com", "amazon.",
  "google.com", "bing.com", "pinterest.com", "tiktok.com",
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isCompanySite(url: string): boolean {
  const h = hostOf(url).toLowerCase();
  return !!h && !NON_COMPANY_HOSTS.some((bad) => h.includes(bad));
}

export async function webSearch(
  query: string,
  opts: {
    maxResults?: number;
    includeRawContent?: boolean;
    includeDomains?: string[];
    excludeDomains?: string[];
    days?: number;
  } = {}
): Promise<SearchHit[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: opts.maxResults ?? 8,
        include_raw_content: opts.includeRawContent ?? false,
        ...(opts.includeDomains?.length ? { include_domains: opts.includeDomains } : {}),
        ...(opts.excludeDomains?.length ? { exclude_domains: opts.excludeDomains } : {}),
        ...(opts.days ? { days: opts.days, topic: "news" } : {}),
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string; raw_content?: string }[];
    };
    return (data.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({
        title: r.title ?? "",
        url: r.url!,
        content: r.content ?? "",
        rawContent: r.raw_content ?? undefined,
      }));
  } catch {
    return [];
  }
}

/** Full-text extraction of one or more pages (e.g. a company's About/Contact). */
export async function webExtract(urls: string[]): Promise<Record<string, string>> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || urls.length === 0) return {};
  try {
    const res = await fetch(EXTRACT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, urls: urls.slice(0, 5) }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { results?: { url?: string; raw_content?: string }[] };
    const out: Record<string, string> = {};
    for (const r of data.results ?? []) {
      if (r.url && r.raw_content) out[r.url] = r.raw_content;
    }
    return out;
  } catch {
    return {};
  }
}

/** First email / Egyptian-style phone found in page text (best-effort). */
export function scrapeContacts(text: string): { email: string; phone: string } {
  const email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0] ?? "";
  // +20… or 0-led Egyptian numbers, 9–13 digits with common separators.
  const phone =
    text.match(/(?:\+?20[\s-]?|0)(?:1\d|2|3|[45]\d)[\d\s-]{6,11}\d/)?.[0]?.trim() ?? "";
  return { email: email.toLowerCase(), phone };
}
