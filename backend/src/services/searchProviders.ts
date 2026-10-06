import fetch from "node-fetch";
import { config, isSearchConfigured } from "../config";
import { SearchResultItem } from "../types";
import { isAuthoritativeDomain } from "./searchService";

export interface SearchOutcome {
  results: SearchResultItem[];
  provider: "google" | "duckduckgo+wikipedia" | "none";
  query: string;
}

const TIMEOUT_MS = 8000;

async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal as any,
      headers: { accept: "application/json", "user-agent": "ai-visual-qa/1.0" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // a failing provider must never break the request
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Uses Google Programmable Search when a key is configured, and otherwise falls back to
 * keyless sources so the app works with zero setup.
 */
export async function runSearch(query: string): Promise<SearchOutcome> {
  if (isSearchConfigured()) {
    const results = await googleSearch(query);
    if (results.length) return { results, provider: "google", query };
  }

  const [ddg, wiki] = await Promise.all([duckDuckGoSearch(query), wikipediaSearch(query)]);
  const results = dedupe([...ddg, ...wiki]);

  return {
    results,
    provider: results.length ? "duckduckgo+wikipedia" : "none",
    query,
  };
}

async function googleSearch(query: string): Promise<SearchResultItem[]> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", config.googleSearch.apiKey);
  url.searchParams.set("cx", config.googleSearch.engineId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", "8");

  const data = await fetchJson(url.toString());
  const items: any[] = data?.items || [];

  return items.map((item) => toResult(item.title, item.link, item.snippet));
}

async function duckDuckGoSearch(query: string): Promise<SearchResultItem[]> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const data = await fetchJson(url.toString());
  if (!data) return [];

  const results: SearchResultItem[] = [];

  if (data.AbstractText && data.AbstractURL) {
    results.push(toResult(data.Heading || query, data.AbstractURL, data.AbstractText));
  }
  if (data.Answer && typeof data.Answer === "string") {
    results.push(toResult(`DuckDuckGo instant answer`, data.AbstractURL || "https://duckduckgo.com/", data.Answer));
  }

  for (const topic of (data.RelatedTopics || []).slice(0, 6)) {
    if (topic?.Text && topic?.FirstURL) {
      results.push(toResult(topic.Text.split(" - ")[0], topic.FirstURL, topic.Text));
    }
  }

  return results;
}

async function wikipediaSearch(query: string): Promise<SearchResultItem[]> {
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", query);
  searchUrl.searchParams.set("srlimit", "4");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const data = await fetchJson(searchUrl.toString());
  const hits: any[] = data?.query?.search || [];
  if (!hits.length) return [];

  // The search endpoint's snippets are HTML fragments; the summary endpoint gives clean prose,
  // which matters because snippets are what the answer heuristics read.
  const summaries = await Promise.all(
    hits.slice(0, 3).map(async (hit) => {
      const title = String(hit.title);
      const summary = await fetchJson(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`
      );
      const extract = summary?.extract || stripHtml(hit.snippet || "");
      const link = summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
      return toResult(title, link, extract);
    })
  );

  return summaries.filter((s) => s.snippet);
}

export interface EncyclopediaEntry {
  title: string;
  extract: string;
  url: string;
}

/**
 * Looks up one term's encyclopedia article. Used to check a multiple-choice option against
 * the question's own keywords ("does Mars's article mention 'red planet'?"), which is far more
 * reliable than counting how often each option appears in generic search snippets — every
 * article about planets mentions all of them.
 */
export async function lookupEncyclopedia(term: string): Promise<EncyclopediaEntry | null> {
  const direct = await wikipediaSummary(term);
  if (direct) return direct;

  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", term);
  searchUrl.searchParams.set("srlimit", "1");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const data = await fetchJson(searchUrl.toString());
  const title = data?.query?.search?.[0]?.title;
  if (!title) return null;

  return wikipediaSummary(String(title));
}

async function wikipediaSummary(title: string): Promise<EncyclopediaEntry | null> {
  const summary = await fetchJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.trim().replace(/ /g, "_"))}`
  );
  if (!summary?.extract || summary.type === "disambiguation") return null;

  return {
    title: String(summary.title || title),
    extract: String(summary.extract),
    url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

function toResult(title: string, link: string, snippet: string): SearchResultItem {
  let displayLink = "";
  try {
    displayLink = new URL(link).hostname;
  } catch {
    displayLink = link;
  }
  return {
    title: String(title || "").trim(),
    link: String(link || ""),
    snippet: stripHtml(String(snippet || "")).trim(),
    displayLink,
    isAuthoritative: isAuthoritativeDomain(displayLink),
  };
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");
}

function dedupe(results: SearchResultItem[]): SearchResultItem[] {
  const seen = new Set<string>();
  const out: SearchResultItem[] = [];
  for (const r of results) {
    if (!r.link || seen.has(r.link)) continue;
    seen.add(r.link);
    out.push(r);
  }
  return out;
}
