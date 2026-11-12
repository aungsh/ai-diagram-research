import type { Approach } from "../approaches";

/** Types and rules for attempts. No server code here, so the browser can use it too. */

export const MAX_TRIES = 3;

export type Attempt = {
  n: number;
  source: string;
  svg: string;
  drew: boolean;
  /** Problems found by our code. */
  autoIssues: string[];
  /** The model's own look at the picture. Null when there was no picture to look at. */
  visual: { pass: boolean; issues: string[] } | null;
  accepted: boolean;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  error?: string;
};

export type RunResult = {
  modelId: string;
  modelName: string;
  method: Approach;
  questionId: string;
  runBy: string;
  ranAt: string;
  attempts: Attempt[];
  /** The attempt shown as the result. */
  chosen: number;
  accepted: boolean;
};

/** An attempt is accepted when it draws, our checks find nothing, and the picture check passes. */
export function isAccepted(a: Pick<Attempt, "drew" | "autoIssues" | "visual">): boolean {
  return a.drew && a.autoIssues.length === 0 && !!a.visual?.pass;
}

/** First accepted attempt; if none, the one with the fewest problems, preferring later tries on a tie. */
export function chooseAttempt(attempts: Attempt[]): number {
  const ok = attempts.find((a) => a.accepted);
  if (ok) return ok.n;
  const score = (a: Attempt) => (a.drew ? 0 : 100) + a.autoIssues.length + (a.visual?.issues.length ?? 3);
  return [...attempts].sort((a, b) => score(a) - score(b) || b.n - a.n)[0]?.n ?? 1;
}

/** Plain reason an attempt is not the one shown. */
export function whyNotChosen(a: Attempt, result: RunResult): string | null {
  if (a.n === result.chosen) return null;
  if (!a.drew) return "It did not draw.";
  const problems = [...a.autoIssues, ...(a.visual?.issues ?? [])];
  if (!a.accepted && problems.length) return `It had ${problems.length === 1 ? "a problem" : `${problems.length} problems`}, so it was sent back to be fixed.`;
  if (!a.accepted) return "The picture check did not pass it.";
  return "A later attempt was chosen.";
}

