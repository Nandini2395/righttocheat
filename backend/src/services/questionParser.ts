import { QuestionType } from "../types";

export interface ParsedQuestion {
  questionText: string;
  options: ParsedOption[];
  questionType: QuestionType;
  mathExpression: string | null;
}

export interface ParsedOption {
  label: string; // "A", "B", "1", ...
  text: string; // option text without the label
  raw: string; // original line
}

// Matches "A)", "A.", "(A)", "1)", "1." at the start of a line.
const OPTION_RE = /^\s*\(?([A-Ha-h]|[1-9])[).\]]\s+(.{1,200})$/;
const MATH_RE = /^[\s\d+\-*/^().x×÷=]+$/i;

export function parseQuestion(rawText: string): ParsedQuestion {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const options: ParsedOption[] = [];
  const questionLines: string[] = [];
  let seenOption = false;

  for (const line of lines) {
    const match = line.match(OPTION_RE);
    if (match) {
      seenOption = true;
      options.push({ label: match[1].toUpperCase(), text: match[2].trim(), raw: line });
      continue;
    }
    // Once options start, later unlabelled lines are usually wrapped option text or noise,
    // not part of the question stem.
    if (!seenOption) questionLines.push(line);
  }

  let questionText = questionLines.join(" ").trim();

  // Options are often laid out on one line: "A) Venus  B) Mars  C) Jupiter"
  if (options.length === 0) {
    const inline = extractInlineOptions(questionText);
    if (inline.options.length >= 2) {
      questionText = inline.stem;
      options.push(...inline.options);
    }
  }

  const mathExpression = findMathExpression(questionText || rawText);

  return {
    questionText: questionText || rawText.trim(),
    options,
    questionType: classify(questionText || rawText, options, mathExpression),
    mathExpression,
  };
}

function extractInlineOptions(text: string): { stem: string; options: ParsedOption[] } {
  // Split on labels that appear mid-line, e.g. " B) " or " (C) "
  const parts = text.split(/\s+\(?([A-Ha-h]|[1-9])[).]\s+/);
  if (parts.length < 5) return { stem: text, options: [] };

  const stem = parts[0].trim();
  const options: ParsedOption[] = [];
  for (let i = 1; i < parts.length - 1; i += 2) {
    const label = parts[i].toUpperCase();
    const body = parts[i + 1].trim();
    if (body) options.push({ label, text: body, raw: `${label}) ${body}` });
  }
  return { stem, options };
}

function findMathExpression(text: string): string | null {
  // A pure arithmetic line, optionally prefixed by words like "What is".
  const stripped = text.replace(/^(what\s+is|calculate|compute|solve|evaluate|find)\s*/i, "").replace(/\?$/, "").trim();
  if (!stripped) return null;
  if (!MATH_RE.test(stripped)) return null;
  if (!/\d/.test(stripped)) return null;
  if (!/[+\-*/^x×÷=]/i.test(stripped)) return null;
  return stripped;
}

function classify(text: string, options: ParsedOption[], mathExpression: string | null): QuestionType {
  const lower = text.toLowerCase();

  if (options.length >= 2) {
    const optionTexts = options.map((o) => o.text.toLowerCase().trim());
    if (optionTexts.every((t) => t === "true" || t === "false")) return "true_false";
    return "multiple_choice";
  }

  if (/^\s*(true or false|state whether)/i.test(text)) return "true_false";
  if (mathExpression) return mathExpression.includes("=") ? "mathematical" : "numerical";
  if (/^(what is|what are|define|definition of|meaning of)\b/i.test(lower)) return "definition";
  if (/\b(who|when|where|which|what)\b/i.test(lower)) return "general_knowledge";

  return "unknown";
}
