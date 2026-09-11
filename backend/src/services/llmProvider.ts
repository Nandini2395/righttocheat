import fetch from "node-fetch";
import { config } from "../config";

export interface LlmMessage {
  role: "user" | "system";
  text: string;
  imageBase64?: string; // raw base64, no data: prefix
  imageMediaType?: string; // e.g. image/jpeg
}

/**
 * Calls the configured LLM provider with an optional image, instructing it to
 * respond with a single JSON object, and returns that object parsed.
 * The provider abstraction keeps callers agnostic of Anthropic vs OpenAI wire formats.
 */
export async function callLlmForJson(params: {
  systemPrompt: string;
  userText: string;
  imageBase64?: string;
  imageMediaType?: string;
  maxTokens?: number;
}): Promise<any> {
  const call = () =>
    config.llmProvider === "anthropic"
      ? callAnthropic(params)
      : config.llmProvider === "openai"
      ? callOpenAi(params)
      : callGemini(params);

  const raw = await withRetryOnTransientError(call);
  return extractJson(raw);
}

// Free-tier providers (Gemini especially) occasionally return 429/503 under load —
// one short retry smooths that over instead of surfacing it as a hard scan failure.
async function withRetryOnTransientError<T>(fn: () => Promise<T>, retries = 1, delayMs = 1200): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTransient = /\((429|500|502|503|504)\)/.test(message);
    if (retries > 0 && isTransient) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return withRetryOnTransientError(fn, retries - 1, delayMs);
    }
    throw err;
  }
}

async function callAnthropic(params: {
  systemPrompt: string;
  userText: string;
  imageBase64?: string;
  imageMediaType?: string;
  maxTokens?: number;
}): Promise<string> {
  const content: any[] = [];
  if (params.imageBase64) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: params.imageMediaType || "image/jpeg",
        data: params.imageBase64,
      },
    });
  }
  content.push({ type: "text", text: params.userText });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropic.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.imageBase64 ? config.anthropic.visionModel : config.anthropic.textModel,
      max_tokens: params.maxTokens || 1500,
      system: params.systemPrompt,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errBody}`);
  }

  const data: any = await res.json();
  const textBlock = (data.content || []).find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("Anthropic response contained no text content");
  return textBlock.text as string;
}

async function callOpenAi(params: {
  systemPrompt: string;
  userText: string;
  imageBase64?: string;
  imageMediaType?: string;
  maxTokens?: number;
}): Promise<string> {
  const userContent: any[] = [{ type: "text", text: params.userText }];
  if (params.imageBase64) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${params.imageMediaType || "image/jpeg"};base64,${params.imageBase64}`,
      },
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.openai.apiKey}`,
    },
    body: JSON.stringify({
      model: params.imageBase64 ? config.openai.visionModel : config.openai.textModel,
      max_tokens: params.maxTokens || 1500,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errBody}`);
  }

  const data: any = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI response contained no message content");
  return text as string;
}

async function callGemini(params: {
  systemPrompt: string;
  userText: string;
  imageBase64?: string;
  imageMediaType?: string;
  maxTokens?: number;
}): Promise<string> {
  const model = params.imageBase64 ? config.google.visionModel : config.google.textModel;
  const parts: any[] = [{ text: params.userText }];
  if (params.imageBase64) {
    parts.push({
      inline_data: {
        mime_type: params.imageMediaType || "image/jpeg",
        data: params.imageBase64,
      },
    });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.google.apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: params.systemPrompt }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          maxOutputTokens: params.maxTokens || 1500,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Gemini API error (${res.status}): ${errBody}`);
  }

  const data: any = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("");
  if (!text) {
    const finishReason = data.candidates?.[0]?.finishReason;
    throw new Error(`Gemini response contained no text content${finishReason ? ` (finishReason: ${finishReason})` : ""}`);
  }
  return text as string;
}

function extractJson(raw: string): any {
  // Providers occasionally wrap JSON in markdown fences despite instructions; strip those.
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) text = fenceMatch[1];

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error(`LLM response was not valid JSON: ${raw.slice(0, 300)}`);
  }
  const jsonSlice = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonSlice);
  } catch (e) {
    throw new Error(`Failed to parse LLM JSON response: ${(e as Error).message}`);
  }
}
