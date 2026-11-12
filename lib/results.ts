import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Approach } from "./approaches";
import type { RunResult } from "./pipeline/run";

const ROOT = path.join(process.cwd(), "results");

/** Display order for tested models. */
const ORDER = ["claude-sonnet-5-5", "claude-haiku-5-5", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];

/** Things a reader should know about how each model's runs went. Shown on the overview page. */
export const RUN_NOTES: Record<string, string[]> = {
  "claude-sonnet-5-5": [
    "Run by Claude Code helper agents playing the model, because there was no Claude API key. They used the same prompts and the same automatic checks as the API runs.",
    "Some helper agents did not follow the rules exactly. Several made retries by editing their earlier answer with text tools instead of writing it out again, one used a small script to list repeated cross marks, and one recorded steps out of order. None of them calculated coordinates with code.",
    "Self judging was lenient in places. For example, a helper passed two action potential graphs where a tick label touches the curve.",
  ],
  "claude-haiku-5-5": [
    "Run by Claude Code helper agents playing the model, because there was no Claude API key. They used the same prompts and the same automatic checks as the API runs.",
    "On the circle question in TikZ, the notes for try 1 show the problems found in try 2 because of a recording slip. No try was accepted either way.",
    "On the vectors question with our renderer, the model passed its own picture, but our check flagged that the dashed line touches label D. Looking at it, the line does clip the corner of the label.",
  ],
  "gemini-3.5-flash": [
    "The free tier allows 20 requests a day for this model, and each try uses two. It stopped after one question and resumes when the daily limit resets.",
  ],
  "gemini-3.5-flash-lite": ["Run through the Gemini API on the free tier."],
};

/** Why a model may have empty panels. */
export const PENDING: Record<string, string> = {
  "gemini-3.5-flash": "The free tier allows 20 requests a day for this model, and each try uses two. It runs a few questions a day until the set is complete.",
  "gemini-3.5-flash-lite": "This model is still working through the questions. Results appear as each one finishes.",
};

export type TestedModel = { id: string; name: string; runBy: string; runs: number };

function load(file: string): RunResult | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as RunResult;
  } catch {
    return null;
  }
}

export function testedModels(): TestedModel[] {
  if (!existsSync(ROOT)) return [];
  const out: TestedModel[] = [];
  for (const id of readdirSync(ROOT)) {
    const dir = path.join(ROOT, id);
    if (id.startsWith("_") || !statSync(dir).isDirectory()) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    if (!files.length) continue;
    const first = load(path.join(dir, files[0]));
    if (!first) continue;
    out.push({ id, name: first.modelName, runBy: first.runBy, runs: files.length });
  }
  return out.sort((a, b) => (ORDER.indexOf(a.id) + 99) % 99 - (ORDER.indexOf(b.id) + 99) % 99);
}

export function getRun(modelId: string, questionId: string, method: Approach): RunResult | null {
  if (!/^[a-z0-9.-]+$/.test(modelId) || !/^[a-z0-9-]+$/.test(questionId)) return null;
  const f = path.join(ROOT, modelId, `${questionId}-${method}.json`);
  return existsSync(f) ? load(f) : null;
}

export function allRuns(modelId: string): RunResult[] {
  const dir = path.join(ROOT, modelId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => load(path.join(dir, f)))
    .filter((r): r is RunResult => !!r);
}
