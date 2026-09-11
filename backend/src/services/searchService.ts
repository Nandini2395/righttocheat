import fetch from "node-fetch";
import { config, isSearchConfigured } from "../config";
import { SearchResultItem } from "../types";

const AUTHORITATIVE_PATTERNS: RegExp[] = [
  /\.gov$/i,
  /\.edu$/i,
  /\.ac\.[a-z]{2}$/i, // e.g. ac.uk, ac.in
  /wikipedia\.org$/i,
  /britannica\.com$/i,
  /nist\.gov$/i,
  /who\.int$/i,
  /nasa\.gov$/i,
  /khanacademy\.org$/i,
  /nature\.com$/i,
  /sciencedirect\.com$/i,
  /ncbi\.nlm\.nih\.gov$/i,
];

export function isAuthoritativeDomain(hostname: string): boolean {
  return AUTHORITATIVE_PATTERNS.some((re) => re.test(hostname));
}

/**
 * Runs a Google Programmable Search (Custom Search JSON API) query and returns
 * normalized, deduplicated results with an authoritative-source flag.
 */
export async function searchGoogle(query: string, count = 6): Promise<SearchResultItem[]> {
  if (!isSearchConfigured()) return [];

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", config.googleSearch.apiKey);
  url.searchParams.set("cx", config.googleSearch.engineId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(count, 10)));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Search API error (${res.status}): ${body}`);
  }

  const data: any = await res.json();
  const items: any[] = data.items || [];

  const results: SearchResultItem[] = items.map((item) => {
    let hostname = item.displayLink || "";
    try {
      hostname = new URL(item.link).hostname;
    } catch {
      // keep displayLink fallback
    }
    return {
      title: String(item.title || ""),
      link: String(item.link || ""),
      snippet: String(item.snippet || ""),
      displayLink: String(item.displayLink || hostname),
      isAuthoritative: isAuthoritativeDomain(hostname),
    };
  });

  // De-dupe by hostname to encourage source diversity, authoritative sources first.
  const seen = new Set<string>();
  const deduped: SearchResultItem[] = [];
  for (const r of [...results].sort((a, b) => Number(b.isAuthoritative) - Number(a.isAuthoritative))) {
    if (seen.has(r.displayLink)) continue;
    seen.add(r.displayLink);
    deduped.push(r);
  }

  return deduped;
}
