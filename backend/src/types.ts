export type QuestionType =
  | "multiple_choice"
  | "numerical"
  | "conceptual"
  | "mathematical"
  | "true_false"
  | "definition"
  | "reading_comprehension"
  | "general_knowledge"
  | "unknown";

export interface ExtractedQuestion {
  hasQuestion: boolean;
  isComplete: boolean;
  isBlurry: boolean;
  ocrConfidence: number; // 0-1
  questionText: string;
  options: string[]; // for MCQ, e.g. ["A) ...", "B) ..."]
  questionType: QuestionType;
  mathNotation: string | null; // LaTeX-ish or plain-text preserved notation
  tableMarkdown: string | null; // markdown table if a table was present
  diagramDescription: string | null; // description of any diagram/figure/chart
  rawOcrText: string; // full raw text extracted, for debugging/context
  clarificationMessage: string | null; // set when hasQuestion/isComplete is false
}

export interface GeneratedAnswer {
  answer: string;
  explanation: string;
  selectedOption: string | null; // e.g. "B" for MCQ
  calculationSteps: string[]; // for numerical/mathematical questions
}

export interface SearchResultItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  isAuthoritative: boolean;
}

export type VerificationStatus = "verified" | "likely_correct" | "needs_review";

export interface VerificationResult {
  status: VerificationStatus;
  confidence: number; // 0-1, evidence-based
  reasoning: string;
  disagreements: string[];
  usedSources: SearchResultItem[];
  searchPerformed: boolean;
  searchQuery: string | null;
}

export interface AnalyzeResponseBody {
  id: string;
  timestamp: string;
  status: "ok" | "needs_clearer_image" | "no_question_detected" | "error";
  message?: string;
  extracted?: ExtractedQuestion;
  answer?: GeneratedAnswer;
  verification?: VerificationResult;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  questionText: string;
  questionType: QuestionType;
  answer: string;
  explanation: string;
  verificationStatus: VerificationStatus;
  confidence: number;
  sources: SearchResultItem[];
}
