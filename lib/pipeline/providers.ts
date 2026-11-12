import Anthropic from "@anthropic-ai/sdk";

export type Msg = { role: "user" | "assistant"; text: string; image?: Buffer };
export type GenResult = { text: string; inputTokens: number; outputTokens: number };
export type Generate = (system: string, messages: Msg[], opts?: { json?: boolean }) => Promise<GenResult>;

import { LIVE_MODELS, type ModelInfo } from "../models";
export { LIVE_MODELS, type ModelInfo };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class QuotaError extends Error {}

export function geminiGenerate(apiKey: string, model: string): Generate {
  return async (system, messages, opts) => {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [
          ...(m.image ? [{ inline_data: { mime_type: "image/png", data: m.image.toString("base64") } }] : []),
          { text: m.text },
        ],
      })),
      generationConfig: { maxOutputTokens: 32000, ...(opts?.json ? { responseMimeType: "application/json" } : {}) },
    };
    for (let tryNo = 0; ; tryNo++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 240_000);
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          signal: ac.signal,
          headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (e) {
        clearTimeout(timer);
        if (tryNo < 3) {
          await sleep(5000 * (tryNo + 1));
          continue;
        }
        throw new Error(`Gemini request failed: ${(e as Error).message}`);
      }
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (res.status === 429 || res.status === 503) {
        const msg: string = data?.error?.message ?? "";
        // A daily limit will not clear by waiting a minute.
        if (res.status === 429 && /per day|PerDay|daily/i.test(JSON.stringify(data))) throw new QuotaError(`Daily free quota used up for ${model}.`);
        const retry = (data?.error?.details ?? []).find((d: { retryDelay?: string }) => d.retryDelay)?.retryDelay;
        const waitMs = retry ? Math.ceil(parseFloat(retry) * 1000) + 1000 : 15000 * (tryNo + 1);
        if (tryNo < 6) {
          await sleep(Math.min(waitMs, 90_000));
          continue;
        }
        throw new QuotaError(`${model} is rate limited: ${msg.slice(0, 160)}`);
      }
      if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(data?.error?.message ?? "").slice(0, 300)}`);
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((p: { thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text ?? "")
        .join("");
      if (!text) throw new Error(`Gemini returned no text (finish reason ${data.candidates?.[0]?.finishReason ?? "unknown"}).`);
      const u = data.usageMetadata ?? {};
      return { text, inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) };
    }
  };
}

export function anthropicGenerate(apiKey: string, model: string): Generate {
  const client = new Anthropic({ apiKey });
  return async (system, messages) => {
    const content = (m: Msg): Anthropic.ContentBlockParam[] => [
      ...(m.image ? [{ type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: m.image.toString("base64") } }] : []),
      { type: "text" as const, text: m.text },
    ];
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 16000,
        system,
        messages: messages.map((m) => ({ role: m.role, content: content(m) })),
      });
      if (res.stop_reason === "refusal") throw new Error("Claude declined this request.");
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new Error("The Claude API key was not accepted.");
      if (e instanceof Anthropic.RateLimitError) throw new QuotaError("Claude rate limit reached. Try again shortly.");
      if (e instanceof Anthropic.APIError) throw new Error(`Claude API error ${e.status}: ${e.message}`);
      throw e;
    }
  };
}

export function generatorFor(model: ModelInfo, apiKey: string): Generate {
  return model.provider === "gemini" ? geminiGenerate(apiKey, model.id) : anthropicGenerate(apiKey, model.id);
}
