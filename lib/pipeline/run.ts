import type { Approach } from "../approaches";
import { checkPrompt, extractCode, parseVerdict, questionPrompt, retryPrompt, systemPrompt } from "../prompts";
import { staticCheck } from "./check";
import type { Generate, Msg } from "./providers";

export { MAX_TRIES, isAccepted, chooseAttempt, whyNotChosen } from "./attempts";
export type { Attempt, RunResult } from "./attempts";
import { MAX_TRIES, isAccepted, chooseAttempt, type Attempt, type RunResult } from "./attempts";

export async function runAttempts(opts: {
  generate: Generate;
  /** The model that judges the picture. Defaults to the same model. */
  judge?: Generate;
  method: Approach;
  questionId: string;
  question: string;
  figure?: string;
  modelId: string;
  modelName: string;
  runBy: string;
  onAttempt?: (a: Attempt) => void;
}): Promise<RunResult> {
  const { generate, method, question } = opts;
  const judge = opts.judge ?? generate;
  const system = systemPrompt(method);
  const convo: Msg[] = [{ role: "user", text: questionPrompt(question, opts.figure) }];
  const attempts: Attempt[] = [];

  for (let n = 1; n <= MAX_TRIES; n++) {
    const t0 = Date.now();
    let reply;
    try {
      reply = await generate(system, convo);
    } catch (e) {
      const a: Attempt = { n, source: "", svg: "", drew: false, autoIssues: [], visual: null, accepted: false, ms: Date.now() - t0, inputTokens: 0, outputTokens: 0, error: (e as Error).message };
      attempts.push(a);
      opts.onAttempt?.(a);
      throw Object.assign(e as Error, { partial: attempts });
    }
    const source = extractCode(method, reply.text);
    const st = await staticCheck(method, source, `${opts.questionId}-${method}-${n}`);

    let visual: Attempt["visual"] = null;
    let inT = reply.inputTokens,
      outT = reply.outputTokens;
    if (st.png) {
      const v = await judge("You check exam diagrams carefully and reply only with JSON.", [{ role: "user", text: checkPrompt(question, opts.figure), image: st.png }], { json: true });
      visual = parseVerdict(v.text);
      inT += v.inputTokens;
      outT += v.outputTokens;
    }
    const a: Attempt = { n, source, svg: st.svg, drew: st.drew, autoIssues: st.issues, visual, accepted: false, ms: Date.now() - t0, inputTokens: inT, outputTokens: outT };
    a.accepted = isAccepted(a);
    attempts.push(a);
    opts.onAttempt?.(a);
    if (a.accepted) break;

    const issues = [...st.issues, ...(visual?.issues ?? [])];
    if (!issues.length) issues.push("The picture check did not pass it, but gave no reason. Check it against the question again.");
    convo.push({ role: "assistant", text: reply.text });
    convo.push({ role: "user", text: retryPrompt(issues), image: st.png ?? undefined });
  }

  const result: RunResult = {
    modelId: opts.modelId,
    modelName: opts.modelName,
    method,
    questionId: opts.questionId,
    runBy: opts.runBy,
    ranAt: new Date().toISOString(),
    attempts,
    chosen: 1,
    accepted: false,
  };
  result.chosen = chooseAttempt(attempts);
  result.accepted = attempts.some((a) => a.accepted);
  return result;
}
