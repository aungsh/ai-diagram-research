/**
 * Run one Gemini model over every question and method, through the same attempt loop as everything else.
 *   npx tsx scripts/run-model.ts gemini-3.5-flash [questionId ...]
 * Needs GEMINI_API_KEY in .env.local. Results go to results/<model>/<question>-<method>.json.
 * Finished runs are skipped, so it can be stopped and restarted.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APPROACHES } from "../lib/approaches";
import { geminiGenerate, LIVE_MODELS, QuotaError } from "../lib/pipeline/providers";
import { runAttempts, type Attempt } from "../lib/pipeline/run";

const root = path.join(__dirname, "..");
for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}

const modelId = process.argv[2];
const only = process.argv.slice(3);
const model = LIVE_MODELS.find((m) => m.id === modelId && m.provider === "gemini");
if (!model) throw new Error(`Unknown Gemini model ${modelId}`);
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error("GEMINI_API_KEY missing");

const outDir = path.join(root, "results", modelId);
mkdirSync(outDir, { recursive: true });

const questions = (only.length ? only : JSON.parse(readFileSync(path.join(root, "lib", "stats.json"), "utf8")).rows.map((r: { id: string }) => r.id))
  .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
  .map((id: string) => JSON.parse(readFileSync(path.join(root, "fixtures", id, "meta.json"), "utf8")) as { id: string; question: string; figure?: string });

async function main() {
  const gen = geminiGenerate(key!, modelId);
  for (const q of questions) {
    for (const method of APPROACHES) {
      const file = path.join(outDir, `${q.id}-${method}.json`);
      if (existsSync(file)) continue;
      const t0 = Date.now();
      try {
        const r = await runAttempts({
          generate: gen,
          method,
          questionId: q.id,
          question: q.question,
          figure: q.figure,
          modelId,
          modelName: model!.name,
          runBy: "Gemini API, run by our script",
          onAttempt: (a: Attempt) =>
            console.log(`  ${q.id} ${method} try ${a.n}: ${a.accepted ? "accepted" : a.drew ? `${a.autoIssues.length + (a.visual?.issues.length ?? 0)} problems` : "did not draw"}`),
        });
        writeFileSync(file, JSON.stringify(r, null, 1));
        console.log(`${q.id} ${method}: ${r.accepted ? `accepted on try ${r.chosen}` : "not accepted"} (${Math.round((Date.now() - t0) / 1000)} s)`);
      } catch (e) {
        if (e instanceof QuotaError) {
          console.log(`STOP: ${e.message}`);
          return;
        }
        console.log(`${q.id} ${method}: ERROR ${(e as Error).message}`);
      }
    }
  }
}

main().then(() => process.exit(0));
