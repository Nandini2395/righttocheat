import { searchGoogle } from "./searchService";
import { isSearchConfigured } from "../config";
import { ExtractedQuestion, SearchResultItem } from "../types";

const BOILERPLATE_PREFIX =
  /^(choose|select|identify|find|calculate|solve|determine|state)\b[:,]?\s*/i;

/**
 * Builds a search query from the extracted question with a plain heuristic (no LLM call) —
 * strips instructional boilerplate and truncates to a search-friendly length. Google's own
 * ranking handles natural-language questions well, so this deliberately doesn't try to be
 * clever; it just avoids spending an extra model call on query construction.
 */
export function buildSearchQuery(extracted: ExtractedQuestion): string {
  let query = extracted.questionText.trim().replace(BOILERPLATE_PREFIX, "");
  if (!query) query = extracted.rawOcrText.trim();
  return query.slice(0, 300);
}

export async function runVerificationSearch(
  extracted: ExtractedQuestion
): Promise<{ query: string; results: SearchResultItem[] }> {
  if (!isSearchConfigured()) return { query: "", results: [] };

  const query = buildSearchQuery(extracted);
  const results = await searchGoogle(query, 6);
  return { query, results };
}
