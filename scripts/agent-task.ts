/**
 * Tool for Claude helper agents that stand in for a model under test.
 * Every step uses the same prompts and the same automatic checks as the Gemini runner.
 *
 *   npx tsx scripts/agent-task.ts prompt  <method> <questionId>
 *   npx tsx scripts/agent-task.ts check   <model> <questionId> <method> <attempt> <codeFile>
 *   npx tsx scripts/agent-task.ts verdict <model> <questionId> <method> <attempt> <verdictJsonFile>
 *   npx tsx scripts/agent-task.ts finish  <model> <questionId> <method>
 *
 * Files live in results/<model>/work/<questionId>-<method>/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APPROACHES, type Approach } from "../lib/approaches";
import { staticCheck } from "../lib/pipeline/check";
import { chooseAttempt, isAccepted, MAX_TRIES, type Attempt, type RunResult } from "../lib/pipeline/run";
import { checkPrompt, extractCode, parseVerdict, questionPrompt, retryPrompt, systemPrompt } from "../lib/prompts";

const root = path.join(__dirname, "..");
const NAMES: Record<string, string> = { "claude-sonnet-5-5": "Claude Sonnet 5.5", "claude-haiku-5-5": "Claude Haiku 5.5", "claude-opus-5-5": "Claude Opus 5.5" };

const [cmd, ...args] = process.argv.slice(2);

function meta(id: string): { question: string; figure?: string } {
  const f = path.join(root, "fixtures", id, "meta.json");
  if (!existsSync(f)) throw new Error(`no question ${id}`);
  return JSON.parse(readFileSync(f, "utf8"));
}
function method(m: string): Approach {
  if (!(APPROACHES as string[]).includes(m)) throw new Error(`method must be one of ${APPROACHES.join(", ")}`);
  return m as Approach;
}
function workDir(model: string, qid: string, m: string) {
  const d = path.join(root, "results", model, "work", `${qid}-${m}`);
  mkdirSync(d, { recursive: true });
  return d;
}

async function main() {
  if (cmd === "prompt") {
    const [m, qid] = args;
    console.log("=== SYSTEM PROMPT ===\n" + systemPrompt(method(m)) + "\n\n=== USER MESSAGE ===\n" + questionPrompt(meta(qid).question, meta(qid).figure));
    return;
  }
  if (cmd === "check") {
    const [model, qid, m, nStr, file] = args;
    const n = Number(nStr);
    if (!(n >= 1 && n <= MAX_TRIES)) throw new Error(`attempt must be 1 to ${MAX_TRIES}`);
    const reply = readFileSync(file, "utf8");
    const source = extractCode(method(m), reply);
    const st = await staticCheck(method(m), source, `${qid}-${m}-${n}`);
    const dir = workDir(model, qid, m);
    const png = path.join(dir, `attempt-${n}.png`);
    if (st.png) writeFileSync(png, st.png);
    writeFileSync(path.join(dir, `attempt-${n}.json`), JSON.stringify({ n, reply, source, svg: st.svg, drew: st.drew, autoIssues: st.issues, ms: st.ms }, null, 1));
    console.log(JSON.stringify({ drew: st.drew, automaticProblems: st.issues, picture: st.png ? png : null }, null, 1));
    if (st.png) console.log("\nNow open the picture and judge it with this checklist, answering only with JSON:\n\n" + checkPrompt(meta(qid).question, meta(qid).figure));
    else console.log("\nThere is no picture. Your next attempt gets this message:\n\n" + retryPrompt(st.issues));
    return;
  }
  if (cmd === "verdict") {
    const [model, qid, m, nStr, file] = args;
    const dir = workDir(model, qid, m);
    const f = path.join(dir, `attempt-${nStr}.json`);
    const a = JSON.parse(readFileSync(f, "utf8"));
    a.visual = parseVerdict(readFileSync(file, "utf8"));
    a.accepted = isAccepted(a);
    writeFileSync(f, JSON.stringify(a, null, 1));
    const issues = [...a.autoIssues, ...a.visual.issues];
    if (a.accepted) console.log("ACCEPTED. Run finish for this question and method.");
    else if (Number(nStr) >= MAX_TRIES) console.log("Not accepted, and this was the last attempt. Run finish.");
    else console.log(`Not accepted. Write attempt ${Number(nStr) + 1} as your reply to this message:\n\n` + retryPrompt(issues.length ? issues : ["The picture check did not pass it, but gave no reason. Check it against the question again."]));
    return;
  }
  if (cmd === "finish") {
    const [model, qid, m] = args;
    const dir = workDir(model, qid, m);
    const attempts: Attempt[] = readdirSync(dir)
      .filter((f) => /^attempt-\d\.json$/.test(f))
      .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
      .sort((a, b) => a.n - b.n)
      .map((a) => ({
        n: a.n,
        source: a.source,
        svg: a.svg,
        drew: a.drew,
        autoIssues: a.autoIssues,
        visual: a.visual ?? null,
        accepted: !!a.accepted,
        ms: a.ms,
        inputTokens: 0,
        outputTokens: 0,
      }));
    if (!attempts.length) throw new Error("no attempts recorded");
    const r: RunResult = {
      modelId: model,
      modelName: NAMES[model] ?? model,
      method: method(m),
      questionId: qid,
      runBy: "Claude Code helper agent playing the model, same prompts and checks",
      ranAt: new Date().toISOString(),
      attempts,
      chosen: chooseAttempt(attempts),
      accepted: attempts.some((a) => a.accepted),
    };
    writeFileSync(path.join(root, "results", model, `${qid}-${m}.json`), JSON.stringify(r, null, 1));
    console.log(`saved: ${r.accepted ? `accepted on attempt ${r.chosen}` : "not accepted"}`);
    return;
  }
  console.log("usage: prompt | check | verdict | finish (see top of file)");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("ERROR:", (e as Error).message);
    process.exit(1);
  },
);
