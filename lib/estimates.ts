import stats from "./stats.json";
import { APPROACHES, type Approach } from "./approaches";
import { listPresets, tries } from "./fixtures";

/** Claude API prices per million tokens, from Anthropic's model table (November 2026). */
export const MODELS = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", input: 4, output: 20 },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", input: 2, output: 10 },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", input: 0.1, output: 0.5 },
] as const;

/** Assumptions behind the estimates. Each one is shown on the page. */
export const ASSUME = {
  charsPerToken: 3,
  /** Rules about style and output format that every method needs. */
  baseInstructionTokens: 400,
  questionTokens: 200,
  /** Claude thinks before answering; we assume the thinking is about as long as the answer. */
  thinkingRatio: 1,
  /** One look at the drawn picture: the image plus a short request, and a short reply. */
  checkInputTokens: 900,
  checkOutputTokens: 150,
  /** Output speed is not published, so this is a placeholder until we can measure it. */
  tokensPerSecond: 60,
  /** Network and start up time per request. */
  requestOverheadS: 1.5,
};

export type Estimate = {
  method: Approach;
  answerTokens: number;
  instructionTokens: number;
  avgTries: number;
  drawMs: number;
  cost: Record<(typeof MODELS)[number]["id"], number>;
  seconds: number;
};

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function estimates(): Estimate[] {
  const presets = listPresets();
  return APPROACHES.map((method) => {
    const rows = stats.rows.filter((r) => r.method === method);
    const answerTokens = Math.round(median(rows.map((r) => r.chars)) / ASSUME.charsPerToken);
    const instructionTokens = Math.round(stats.instructions[method] / ASSUME.charsPerToken) + ASSUME.baseInstructionTokens;
    const avgTries = presets.reduce((n, p) => n + tries(p, method), 0) / presets.length;
    const drawMs = median(rows.map((r) => r.drawMs));

    // One try = write the figure, draw it, then show the picture to Claude to check it.
    // A retry also sends back the previous answer and what was wrong with it.
    const inputPerTry = instructionTokens + ASSUME.questionTokens + ASSUME.checkInputTokens;
    const outputPerTry = answerTokens * (1 + ASSUME.thinkingRatio) + ASSUME.checkOutputTokens;
    const retryExtraInput = (avgTries - 1) * (answerTokens + 200);
    const totalIn = inputPerTry * avgTries + retryExtraInput;
    const totalOut = outputPerTry * avgTries;

    const cost = Object.fromEntries(MODELS.map((m) => [m.id, (totalIn * m.input + totalOut * m.output) / 1_000_000])) as Estimate["cost"];
    const seconds = avgTries * (outputPerTry / ASSUME.tokensPerSecond + drawMs / 1000 + 2 * ASSUME.requestOverheadS);
    return { method, answerTokens, instructionTokens, avgTries, drawMs, cost, seconds };
  });
}

export const MEASURED_AT = stats.measuredAt;
export const QUESTION_COUNT = stats.rows.length / 3;
