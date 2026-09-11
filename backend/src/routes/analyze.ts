import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { extractQuestionFromFrame } from "../services/visionService";
import { generateAnswerAndVerification } from "../services/answerService";
import { runVerificationSearch } from "../services/verificationService";
import { addHistory } from "../services/historyStore";
import { assertLlmConfigured, config, isSearchConfigured } from "../config";
import { AnalyzeResponseBody, VerificationResult } from "../types";

const router = Router();

const bodySchema = z.object({
  image: z.string().min(100, "image must be a base64 data URL"),
});

const DATA_URL_RE = /^data:(image\/\w+);base64,(.+)$/;

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const configError = assertLlmConfigured();
    if (configError) throw new ApiError(500, configError);

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues.map((i) => i.message).join("; "));
    }

    const match = parsed.data.image.match(DATA_URL_RE);
    if (!match) {
      throw new ApiError(400, "image must be a base64 data URL, e.g. data:image/jpeg;base64,...");
    }
    const [, mediaType, base64] = match;

    const id = uuid();
    const timestamp = new Date().toISOString();

    // 1. Extract the question from the frame (OCR + vision understanding).
    const extracted = await extractQuestionFromFrame(base64, mediaType);

    if (!extracted.hasQuestion) {
      const body: AnalyzeResponseBody = {
        id,
        timestamp,
        status: "no_question_detected",
        message: extracted.clarificationMessage || "No question was detected in the frame. Point the camera at a question.",
      };
      return res.json(body);
    }

    if (!extracted.isComplete || extracted.isBlurry || extracted.ocrConfidence < config.minOcrConfidence) {
      const body: AnalyzeResponseBody = {
        id,
        timestamp,
        status: "needs_clearer_image",
        message:
          extracted.clarificationMessage ||
          "The question isn't fully legible yet. Hold the camera steady, move closer, and make sure the whole question is in frame.",
        extracted,
      };
      return res.json(body);
    }

    // 2. Run a quick, LLM-free Google search for verification evidence.
    const { query: searchQuery, results: searchResults } = await runVerificationSearch(extracted);

    // 3. One combined LLM call: answer independently, then check it against the search
    // evidence. Kept to a single call (instead of separate answer/query/verify calls) to
    // stay well within free-tier LLM quotas.
    const generated = await generateAnswerAndVerification(extracted, searchResults, searchQuery, isSearchConfigured());

    const answer = generated.answer;
    const verification: VerificationResult = {
      status: generated.status,
      confidence: generated.confidence,
      reasoning: generated.reasoning,
      disagreements: generated.disagreements,
      usedSources: generated.usedSources,
      searchPerformed: isSearchConfigured(),
      searchQuery: isSearchConfigured() ? searchQuery : null,
    };

    const body: AnalyzeResponseBody = {
      id,
      timestamp,
      status: "ok",
      extracted,
      answer,
      verification,
    };

    addHistory({
      id,
      timestamp,
      questionText: extracted.questionText,
      questionType: extracted.questionType,
      answer: answer.answer,
      explanation: answer.explanation,
      verificationStatus: verification.status,
      confidence: verification.confidence,
      sources: verification.usedSources,
    });

    res.json(body);
  })
);

export default router;
