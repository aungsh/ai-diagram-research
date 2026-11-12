/** Models offered for live runs. Safe to import in the browser. */
export type ModelInfo = { id: string; name: string; provider: "gemini" | "anthropic"; free?: boolean };

export const LIVE_MODELS: ModelInfo[] = [
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", provider: "gemini", free: true },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", provider: "gemini", free: true },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "gemini", free: true },
  { id: "gemini-4-argon", name: "Gemini 4 Argon", provider: "gemini" },
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "anthropic" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", provider: "anthropic" },
];

