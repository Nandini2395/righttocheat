import { callLlmForJson } from "./llmProvider";
import { ExtractedQuestion, QuestionType } from "../types";

const VALID_TYPES: QuestionType[] = [
  "multiple_choice",
  "numerical",
  "conceptual",
  "mathematical",
  "true_false",
  "definition",
  "reading_comprehension",
  "general_knowledge",
  "unknown",
];

const SYSTEM_PROMPT = `You are a meticulous vision-based question extractor used in an AI visual question-answering app.
You are given a single photo/video frame that may contain a question (from a textbook, exam, worksheet, slide, or screen).

Your job:
1. Decide if a clearly legible question is visible in the frame at all.
2. Decide if that question is FULLY visible and complete (not cut off, not obscured, not too blurry to read confidently).
3. If complete, extract the question text verbatim, any multiple-choice options, equations (preserve mathematical notation using plain-text/LaTeX-like notation, e.g. x^2, \\frac{a}{b}, \\sqrt{x}), tables (as markdown), and describe any diagram/figure/chart that is essential to answering.
4. Ignore irrelevant surrounding text (headers, page numbers, unrelated paragraphs, watermarks) whenever you can distinguish it from the actual question.
5. Classify the question type.
6. Give an honest OCR confidence score between 0 and 1 reflecting how legible/certain the text extraction is (lighting, angle, blur, resolution, partial occlusion all reduce this).

Be conservative: if the frame is blurry, at an odd angle, too far away, or the question is cut off at the frame edge, set isComplete=false and hasQuestion appropriately, and write a short, friendly clarificationMessage telling the user how to reposition the camera (e.g. "Move closer" / "Hold steady, image is blurry" / "The bottom of the question is cut off, tilt the camera down").

Respond with ONLY a single JSON object, no prose, matching exactly this shape:
{
  "hasQuestion": boolean,
  "isComplete": boolean,
  "isBlurry": boolean,
  "ocrConfidence": number,
  "questionText": string,
  "options": string[],
  "questionType": "multiple_choice" | "numerical" | "conceptual" | "mathematical" | "true_false" | "definition" | "reading_comprehension" | "general_knowledge" | "unknown",
  "mathNotation": string | null,
  "tableMarkdown": string | null,
  "diagramDescription": string | null,
  "rawOcrText": string,
  "clarificationMessage": string | null
}`;

export async function extractQuestionFromFrame(imageBase64: string, mediaType: string): Promise<ExtractedQuestion> {
  const json = await callLlmForJson({
    systemPrompt: SYSTEM_PROMPT,
    userText:
      "Analyze this camera frame and extract the question as instructed. Respond with only the JSON object.",
    imageBase64,
    imageMediaType: mediaType,
    maxTokens: 1800,
  });

  return normalize(json);
}

function normalize(json: any): ExtractedQuestion {
  const questionType: QuestionType = VALID_TYPES.includes(json.questionType) ? json.questionType : "unknown";

  return {
    hasQuestion: Boolean(json.hasQuestion),
    isComplete: Boolean(json.isComplete),
    isBlurry: Boolean(json.isBlurry),
    ocrConfidence: clamp01(Number(json.ocrConfidence) || 0),
    questionText: String(json.questionText || "").trim(),
    options: Array.isArray(json.options) ? json.options.map((o: any) => String(o)) : [],
    questionType,
    mathNotation: json.mathNotation ? String(json.mathNotation) : null,
    tableMarkdown: json.tableMarkdown ? String(json.tableMarkdown) : null,
    diagramDescription: json.diagramDescription ? String(json.diagramDescription) : null,
    rawOcrText: String(json.rawOcrText || ""),
    clarificationMessage: json.clarificationMessage ? String(json.clarificationMessage) : null,
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
