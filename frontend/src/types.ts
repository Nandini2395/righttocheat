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
  ocrConfidence: number;
  questionText: string;
  options: string[];
  questionType: QuestionType;
  mathNotation: string | null;
  tableMarkdown: string | null;
  diagramDescription: string | null;
  rawOcrText: string;
  clarificationMessage: string | null;
}

export interface GeneratedAnswer {
  answer: string;
  explanation: string;
  selectedOption: string | null;
  calculationSteps: string[];
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
  confidence: number;
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
