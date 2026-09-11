import { callLlmForJson } from "./llmProvider";
import { ExtractedQuestion, GeneratedAnswer, SearchResultItem, VerificationStatus } from "../types";

// Answering and verification are combined into a single LLM call (instead of two+) to
// minimize calls against free-tier quotas — the search step itself (searchService.ts)
// costs no LLM call at all, so this is the only reasoning pass per question.
const SYSTEM_PROMPT = `You are a rigorous subject-matter expert answering a question extracted from a photo
(textbook/exam/worksheet), and then independently fact-checking your own answer against web search evidence
that's provided to you.

Step 1 — Answer independently, BEFORE looking at any search results:
- For numerical or mathematical questions, work through the calculation step by step yourself; do not skip steps.
- For multiple-choice questions, evaluate every option and explicitly state which single option is correct,
  both its letter/label and its text.
- For true/false questions, state TRUE or FALSE clearly as the answer.
- Keep the explanation concise but complete (a few sentences, or a short numbered list of steps for calculations).
- Preserve units and mathematical notation accurately.
- If the question is genuinely ambiguous or unanswerable from the given information, say so plainly instead of
  guessing.

Step 2 — Then reason about the search evidence given to you (if any) and decide a verification status:
- Read the snippets and consider which sources are authoritative (government/.gov, university/.edu, official
  organizations, academic publishers, reputable encyclopedic/reference sites) — do not just check keyword overlap.
- "verified": multiple credible/authoritative sources clearly support your independent answer, no meaningful
  disagreement.
- "likely_correct": evidence generally supports the answer but is partial/indirect, OR no search evidence was
  available to check against (in which case rely on your own reasoning confidence instead).
- "needs_review": sources conflict with each other or with your answer, search was attempted but found nothing
  relevant, or the question itself is ambiguous.
- Never invent sources — only reference sources that were actually provided to you, by their 0-based index.

Respond with ONLY a single JSON object, no prose, matching exactly this shape:
{
  "answer": string,
  "explanation": string,
  "selectedOption": string | null,
  "calculationSteps": string[],
  "verificationStatus": "verified" | "likely_correct" | "needs_review",
  "confidence": number,
  "verificationReasoning": string,
  "disagreements": string[],
  "usedSourceIndexes": number[]
}`;

export interface AnswerAndVerification {
  answer: GeneratedAnswer;
  status: VerificationStatus;
  confidence: number;
  reasoning: string;
  disagreements: string[];
  usedSources: SearchResultItem[];
}

export async function generateAnswerAndVerification(
  extracted: ExtractedQuestion,
  searchResults: SearchResultItem[],
  searchQuery: string,
  searchConfigured: boolean
): Promise<AnswerAndVerification> {
  const userText = buildPrompt(extracted, searchResults, searchQuery, searchConfigured);

  const json = await callLlmForJson({
    systemPrompt: SYSTEM_PROMPT,
    userText,
    maxTokens: 1800,
  });

  const status: VerificationStatus = ["verified", "likely_correct", "needs_review"].includes(json.verificationStatus)
    ? json.verificationStatus
    : "needs_review";

  const usedIndexes: number[] = Array.isArray(json.usedSourceIndexes)
    ? json.usedSourceIndexes.filter((i: any) => Number.isInteger(i) && i >= 0 && i < searchResults.length)
    : [];
  const usedSources = usedIndexes.length ? usedIndexes.map((i) => searchResults[i]) : searchResults.slice(0, 3);

  return {
    answer: {
      answer: String(json.answer || "").trim(),
      explanation: String(json.explanation || "").trim(),
      selectedOption: json.selectedOption ? String(json.selectedOption) : null,
      calculationSteps: Array.isArray(json.calculationSteps) ? json.calculationSteps.map((s: any) => String(s)) : [],
    },
    status,
    confidence: clamp01(Number(json.confidence) || 0),
    reasoning: String(json.verificationReasoning || ""),
    disagreements: Array.isArray(json.disagreements) ? json.disagreements.map((d: any) => String(d)) : [],
    usedSources,
  };
}

function buildPrompt(
  extracted: ExtractedQuestion,
  searchResults: SearchResultItem[],
  searchQuery: string,
  searchConfigured: boolean
): string {
  const parts: string[] = [];
  parts.push(`Question type: ${extracted.questionType}`);
  parts.push(`Question:\n${extracted.questionText}`);
  if (extracted.options.length) parts.push(`Options:\n${extracted.options.join("\n")}`);
  if (extracted.mathNotation) parts.push(`Math notation present:\n${extracted.mathNotation}`);
  if (extracted.tableMarkdown) parts.push(`Table:\n${extracted.tableMarkdown}`);
  if (extracted.diagramDescription) parts.push(`Diagram/figure description:\n${extracted.diagramDescription}`);

  if (!searchConfigured) {
    parts.push(
      "Web search is not configured for this deployment, so no external verification evidence is available. " +
        "Answer from your own knowledge and set verificationStatus to 'likely_correct' (not 'needs_review') " +
        "unless the question itself is unclear."
    );
  } else if (searchResults.length === 0) {
    parts.push(
      `No relevant web search results were found for the query "${searchQuery}". Set verificationStatus to ` +
        `'needs_review' since independent evidence could not be found.`
    );
  } else {
    const sourceList = searchResults
      .map(
        (r, i) =>
          `[${i}] (${r.isAuthoritative ? "authoritative" : "general"}) ${r.displayLink}\nTitle: ${r.title}\nSnippet: ${r.snippet}`
      )
      .join("\n\n");
    parts.push(`Search results for query "${searchQuery}":\n${sourceList}`);
  }

  parts.push("Answer and verify this question now, following the rules in the system prompt. Respond with only the JSON object.");
  return parts.join("\n\n");
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
