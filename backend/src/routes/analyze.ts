import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { parseQuestion } from "../services/questionParser";
import { runSearch } from "../services/searchProviders";
import { deriveAnswer } from "../services/answerDeriver";
import { addHistory } from "../services/historyStore";
import { config } from "../config";
import { AnalyzeResponseBody, ExtractedQuestion, VerificationResult } from "../types";

const router = Router();

const bodySchema = z.object({
  text: z.string().min(1, "text is required"),
  ocrConfidence: z.number().min(0).max(1).optional(),
});

// Below this many readable characters there isn't enough of a question to search for.
const MIN_QUESTION_LENGTH = 8;

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw new ApiError(400, parsedBody.error.issues.map((i) => i.message).join("; "));
    }

    const { text, ocrConfidence = 0 } = parsedBody.data;
    const id = uuid();
    const timestamp = new Date().toISOString();
    const cleaned = text.replace(/\s+/g, " ").trim();

    if (cleaned.length < MIN_QUESTION_LENGTH) {
      return res.json({
        id,
        timestamp,
        status: "no_question_detected",
        message: "No readable text was found in the frame. Point the camera at a question.",
      } satisfies AnalyzeResponseBody);
    }

    if (ocrConfidence > 0 && ocrConfidence < config.minOcrConfidence) {
      return res.json({
        id,
        timestamp,
        status: "needs_clearer_image",
        message:
          "The text came out too garbled to trust. Hold the camera steady, move closer, and make sure the " +
          "question is well lit and in focus.",
      } satisfies AnalyzeResponseBody);
    }

    const parsed = parseQuestion(text);

    // Search on the question stem only — including the options would bias results toward
    // whichever option happens to share wording with the question.
    const { results, provider, query } = await runSearch(parsed.questionText.slice(0, 300));
    const derived = await deriveAnswer(parsed, results);

    const extracted: ExtractedQuestion = {
      hasQuestion: true,
      isComplete: true,
      isBlurry: false,
      ocrConfidence,
      questionText: parsed.questionText,
      options: parsed.options.map((o) => `${o.label}) ${o.text}`),
      questionType: parsed.questionType,
      mathNotation: parsed.mathExpression,
      tableMarkdown: null,
      diagramDescription: null,
      rawOcrText: text,
      clarificationMessage: null,
    };

    const verification: VerificationResult = {
      status: derived.status,
      confidence: derived.confidence,
      reasoning: derived.reasoning,
      disagreements: derived.disagreements,
      usedSources: derived.usedSources,
      searchPerformed: provider !== "none",
      searchQuery: query,
    };

    addHistory({
      id,
      timestamp,
      questionText: parsed.questionText,
      questionType: parsed.questionType,
      answer: derived.answer.answer,
      explanation: derived.answer.explanation,
      verificationStatus: derived.status,
      confidence: derived.confidence,
      sources: derived.usedSources,
    });

    res.json({
      id,
      timestamp,
      status: "ok",
      extracted,
      answer: derived.answer,
      verification,
    } satisfies AnalyzeResponseBody);
  })
);

export default router;
