import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Approach } from "./approaches";
import type { RunResult } from "./pipeline/run";

/**
 * Test rounds. Each round is a folder of results made with one version of the prompts.
 *  brief:          question plus a description of what the figure must show (current)
 *  question-only:  question text only (first round, kept for comparison)
 */
export const ROUNDS = [
  { id: "brief", name: "With a figure description", dir: "results" },
  { id: "question-only", name: "Question only", dir: "results-archive/question-only" },
] as const;
export type RoundId = (typeof ROUNDS)[number]["id"];

export function roundOf(v: unknown): RoundId {
  return ROUNDS.some((r) => r.id === v) ? (v as RoundId) : "brief";
}

function rootOf(round: RoundId) {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), ROUNDS.find((r) => r.id === round)!.dir);
}

/** Display order for tested models. */
const ORDER = ["claude-sonnet-5-5", "claude-haiku-5-5", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];

const HELPER =
  "Run by Claude Code helper agents playing the model, because there was no Claude API key. They used the same prompts and the same automatic checks as the API runs.";

/** Things a reader should know about how each model's runs went, per round. */
export const RUN_NOTES: Record<RoundId, Record<string, string[]>> = {
  brief: {
    "claude-sonnet-5-5": [
      HELPER,
      "Spot check: I looked at 18 of its accepted pictures, chosen at random across the three methods. I agreed with all of them. Three had small issues: an axis label sitting on grid lines, a vector label a little away from its arrow, and unevenly spaced field marks.",
    ],
    "claude-haiku-5-5": [
      HELPER,
      "Spot check: I looked at 20 of its accepted pictures, chosen at random plus the ones it called close. I would send back 4: a battery drawn as a plain box, a water gun without a proper handle, and two distillation figures with an empty collecting flask. So about 1 in 5 of its passes would not survive a teacher's review, mostly because something in the description is missing.",
    ],
    "gemini-3.5-flash-lite": ["Run through the Gemini API on the free tier."],
  },
  "question-only": {
    "claude-sonnet-5-5": [
      HELPER,
      "Some helper agents did not follow the rules exactly. Several made retries by editing their earlier answer with text tools instead of writing it out again, one used a small script to list repeated cross marks, and one recorded steps out of order. None of them calculated coordinates with code.",
      "Self judging was lenient in places. For example, a helper passed two action potential graphs where a tick label touches the curve.",
    ],
    "claude-haiku-5-5": [
      HELPER,
      "On the circle question in TikZ, the notes for try 1 show the problems found in try 2 because of a recording slip. No try was accepted either way.",
      "On the vectors question with our renderer, the model passed its own picture, but our check flagged that the dashed line touches label D. Looking at it, the line does clip the corner of the label.",
    ],
    "gemini-3.5-flash": ["The free tier allows 20 requests a day for this model, and each try uses two, so this round stopped after one question."],
    "gemini-3.5-flash-lite": ["Run through the Gemini API on the free tier. This round was stopped part way when the figure descriptions were added."],
  },
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

export function testedModels(round: RoundId = "brief"): TestedModel[] {
  const root = rootOf(round);
  if (!existsSync(root)) return [];
  const out: TestedModel[] = [];
  for (const id of readdirSync(root)) {
    const dir = path.join(/*turbopackIgnore: true*/ root, id);
    if (id.startsWith("_") || !statSync(dir).isDirectory()) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    if (!files.length) continue;
    const first = load(path.join(/*turbopackIgnore: true*/ dir, files[0]));
    if (!first) continue;
    out.push({ id, name: first.modelName, runBy: first.runBy, runs: files.length });
  }
  return out.sort((a, b) => ((ORDER.indexOf(a.id) + 99) % 99) - ((ORDER.indexOf(b.id) + 99) % 99));
}

export function getRun(modelId: string, questionId: string, method: Approach, round: RoundId = "brief"): RunResult | null {
  if (!/^[a-z0-9.-]+$/.test(modelId) || !/^[a-z0-9-]+$/.test(questionId)) return null;
  const f = path.join(/*turbopackIgnore: true*/ rootOf(round), modelId, `${questionId}-${method}.json`);
  return existsSync(f) ? load(f) : null;
}

export function allRuns(modelId: string, round: RoundId = "brief"): RunResult[] {
  const dir = path.join(/*turbopackIgnore: true*/ rootOf(round), modelId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => load(path.join(/*turbopackIgnore: true*/ dir, f)))
    .filter((r): r is RunResult => !!r);
}
