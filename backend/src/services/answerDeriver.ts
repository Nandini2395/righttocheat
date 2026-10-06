import { GeneratedAnswer, SearchResultItem, VerificationStatus } from "../types";
import { ParsedOption, ParsedQuestion } from "./questionParser";
import { formatNumber, solveMath } from "./mathSolver";
import { lookupEncyclopedia } from "./searchProviders";
import { isAuthoritativeDomain } from "./searchService";

export interface DerivedAnswer {
  answer: GeneratedAnswer;
  status: VerificationStatus;
  confidence: number;
  reasoning: string;
  disagreements: string[];
  usedSources: SearchResultItem[];
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "is", "are", "was", "were", "to", "in", "on", "at", "for",
  "by", "with", "as", "that", "this", "it", "its", "from", "be", "which", "what", "who", "when",
  "where", "how", "why", "all", "none", "above", "following",
]);

export async function deriveAnswer(parsed: ParsedQuestion, results: SearchResultItem[]): Promise<DerivedAnswer> {
  // Arithmetic is computed directly — that's more reliable than anything search could say,
  // and it's the one case this no-LLM pipeline can answer with real certainty.
  if (parsed.mathExpression) {
    const solved = solveMath(parsed.mathExpression);
    if (solved) {
      return {
        answer: {
          answer: formatNumber(solved.value),
          explanation: "Calculated directly from the expression read by OCR, without relying on search results.",
          selectedOption: matchOptionToValue(parsed.options, solved.value),
          calculationSteps: solved.steps,
        },
        status: "verified",
        confidence: 0.95,
        reasoning: "Computed locally by the math solver, so no external source is needed.",
        disagreements: [],
        usedSources: [],
      };
    }
  }

  if (parsed.options.length >= 2) {
    return scoreOptions(parsed, results);
  }

  if (results.length === 0) {
    return noEvidence(parsed);
  }

  return bestSnippet(parsed, results);
}

const SKIP_LOOKUP = /^(all|none|both)\b|^(all|none) of the above$/i;

/**
 * Pulls each option's own encyclopedia article and measures how well it matches the
 * question's distinctive wording. Phrase matches ("red planet") count heavily because they
 * are what actually distinguishes the right option from its distractors.
 */
async function gatherOptionEvidence(parsed: ParsedQuestion) {
  const keywords = significantWords(parsed.questionText);
  const phrases = bigrams(parsed.questionText);

  return Promise.all(
    parsed.options.map(async (option) => {
      if (SKIP_LOOKUP.test(option.text.trim())) {
        return { option, score: 0, entry: null as Awaited<ReturnType<typeof lookupEncyclopedia>> };
      }

      const entry = await lookupEncyclopedia(option.text).catch(() => null);
      if (!entry) return { option, score: 0, entry: null };

      const haystack = `${entry.title} ${entry.extract}`.toLowerCase();
      const phraseHits = phrases.filter((p) => haystack.includes(p)).length;
      const wordHits = keywords.filter((w) => haystack.includes(w)).length;
      const wordRatio = keywords.length ? wordHits / keywords.length : 0;

      return { option, score: phraseHits * 4 + wordRatio * 3, entry };
    })
  );
}

function significantWords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    )
  );
}

function bigrams(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w) || w.length > 2);
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    if (pair.length > 6) out.push(pair);
  }
  return out;
}

/**
 * Without a language model there is no reasoning step, so a multiple-choice answer is decided
 * by evidence from two directions: each option's own article checked against the question's
 * wording (the strong signal), plus how the option is attested in results for the question
 * itself (a weaker tiebreaker).
 */
async function scoreOptions(parsed: ParsedQuestion, results: SearchResultItem[]): Promise<DerivedAnswer> {
  const evidence = await gatherOptionEvidence(parsed);

  const scored = evidence.map(({ option, score: lookupScore, entry }) => {
    let snippetScore = 0;
    const supporting: SearchResultItem[] = [];

    for (const result of results) {
      const haystack = `${result.title} ${result.snippet}`.toLowerCase();
      const weight = result.isAuthoritative ? 2 : 1;
      const phrase = option.text.toLowerCase().trim();

      let hit = 0;
      if (phrase.length > 2 && haystack.includes(phrase)) hit = 1;

      if (hit > 0) {
        snippetScore += hit * weight;
        supporting.push(result);
      }
    }

    const entrySource: SearchResultItem | null = entry
      ? {
          title: entry.title,
          link: entry.url,
          snippet: entry.extract.slice(0, 300),
          displayLink: safeHost(entry.url),
          isAuthoritative: isAuthoritativeDomain(safeHost(entry.url)),
        }
      : null;

    return {
      option,
      lookupScore,
      score: lookupScore + snippetScore * 0.5,
      supporting,
      entrySource,
    };
  });

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const runnerUp = ranked[1];

  if (!top || top.score === 0) {
    return results.length ? bestSnippet(parsed, results) : noEvidence(parsed);
  }

  const margin = runnerUp && runnerUp.score > 0 ? top.score / runnerUp.score : Infinity;
  const backedByArticle = top.lookupScore >= 4; // at least one distinctive phrase matched

  let status: VerificationStatus;
  let confidence: number;

  if (backedByArticle && margin >= 2) {
    status = "verified";
    confidence = 0.85;
  } else if (margin >= 1.5) {
    status = "likely_correct";
    confidence = backedByArticle ? 0.65 : 0.5;
  } else {
    status = "needs_review";
    confidence = 0.35;
  }

  const disagreements: string[] = [];
  if (margin < 1.5 && runnerUp) {
    disagreements.push(
      `Options ${top.option.label} and ${runnerUp.option.label} are supported about equally by the evidence, so this pick is a coin flip — check the sources.`
    );
  }

  const sources: SearchResultItem[] = [];
  if (top.entrySource) sources.push(top.entrySource);
  for (const s of top.supporting) {
    if (!sources.some((existing) => existing.link === s.link)) sources.push(s);
  }

  return {
    answer: {
      answer: `${top.option.label}) ${top.option.text}`,
      explanation: backedByArticle
        ? `The reference article for "${top.option.text}" matches the wording of the question more closely than ` +
          `the other options do. This is a text-matching result rather than reasoning — check the sources below.`
        : `Option ${top.option.label} has the most supporting text across the sources found, but nothing matched ` +
          `strongly. Treat this as a weak guess and verify it yourself.`,
      selectedOption: top.option.label,
      calculationSteps: [],
    },
    status,
    confidence,
    reasoning: `Scored each option against its own reference article and the search results (${ranked
      .map((r) => `${r.option.label}: ${r.score.toFixed(1)}`)
      .join(", ")}).`,
    disagreements,
    usedSources: sources.slice(0, 4),
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function bestSnippet(parsed: ParsedQuestion, results: SearchResultItem[]): DerivedAnswer {
  const keywords = parsed.questionText
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const ranked = [...results]
    .map((result) => {
      const haystack = `${result.title} ${result.snippet}`.toLowerCase();
      const overlap = keywords.filter((w) => haystack.includes(w)).length;
      return { result, score: overlap * (result.isAuthoritative ? 2 : 1) + (result.snippet ? 0.5 : 0) };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || !best.result.snippet) return noEvidence(parsed);

  const hasAuthoritative = best.result.isAuthoritative;

  return {
    answer: {
      answer: best.result.snippet,
      explanation:
        `Taken from the closest-matching search result (${best.result.displayLink}). ` +
        `This is the source's own wording, not a reasoned answer to the question — read the sources to confirm it fits.`,
      selectedOption: null,
      calculationSteps: [],
    },
    status: hasAuthoritative ? "likely_correct" : "needs_review",
    confidence: hasAuthoritative ? 0.55 : 0.4,
    reasoning: `Picked the result with the most keyword overlap with the question out of ${results.length} results.`,
    disagreements: [],
    usedSources: ranked.slice(0, 4).map((r) => r.result),
  };
}

function noEvidence(parsed: ParsedQuestion): DerivedAnswer {
  return {
    answer: {
      answer: "Couldn't determine an answer",
      explanation:
        "The search didn't return anything that matches this question well enough to pick an answer. " +
        "Try capturing the question again more clearly, or search it yourself.",
      selectedOption: null,
      calculationSteps: [],
    },
    status: "needs_review",
    confidence: 0.1,
    reasoning: "No usable search evidence was found for this question.",
    disagreements: [],
    usedSources: [],
  };
}

function matchOptionToValue(options: ParsedOption[], value: number): string | null {
  const target = formatNumber(value);
  const match = options.find((o) => o.text.replace(/[^\d.\-]/g, "") === target);
  return match ? match.label : null;
}
