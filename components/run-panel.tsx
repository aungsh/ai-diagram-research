"use client";

import { useState } from "react";
import { APPROACH_NAME, type Approach } from "@/lib/approaches";
import { whyNotChosen, type Attempt, type RunResult } from "@/lib/pipeline/attempts";
import { checkPrompt, legacyCheckPrompt, legacyQuestionPrompt, questionPrompt, retryPrompt, systemPrompt } from "@/lib/prompts";
import { cn } from "@/lib/utils";

function status(run: RunResult) {
  if (!run.accepted) return { text: `Not accepted after ${run.attempts.length} tries`, tone: "text-destructive" };
  return run.chosen === 1 ? { text: "Accepted first try", tone: "text-lime" } : { text: `Accepted on try ${run.chosen}`, tone: "text-amber-300/90" };
}

export function RunPanel({
  method,
  run,
  question,
  figure,
  pending,
  legacy,
}: {
  method: Approach;
  run: RunResult | null;
  question: string;
  figure?: string;
  pending?: string;
  /** First round: question only, older wording. */
  legacy?: boolean;
}) {
  const [shown, setShown] = useState(run?.chosen ?? 1);
  const [view, setView] = useState<"diagram" | "code" | "prompt">("diagram");

  if (!run) {
    return (
      <section className="min-w-0">
        <h3 className="mb-3 text-lg font-semibold">{APPROACH_NAME[method]}</h3>
        <div className="flex min-h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
          <span>Not run yet</span>
          {pending && <span className="max-w-sm text-xs leading-relaxed">{pending}</span>}
        </div>
      </section>
    );
  }

  const st = status(run);
  const a = run.attempts.find((x) => x.n === shown) ?? run.attempts[0];

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="text-lg font-semibold">{APPROACH_NAME[method]}</h3>
        <span className={cn("text-sm", st.tone)}>{st.text}</span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {run.attempts.map((x) => (
          <button
            key={x.n}
            onClick={() => setShown(x.n)}
            className={cn(
              "h-8 rounded-md border px-2.5 text-xs transition-colors",
              shown === x.n ? "border-lime/50 bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Try {x.n}
            <span className={cn("ml-1.5", x.accepted ? "text-lime" : !x.drew ? "text-destructive" : "text-amber-300/90")}>
              {x.accepted ? "passed" : !x.drew ? "did not draw" : "problems"}
            </span>
            {x.n === run.chosen && <span className="ml-1.5 text-foreground">· shown as result</span>}
          </button>
        ))}
        <div className="ml-auto flex gap-1 text-xs">
          {(["diagram", "code", "prompt"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cn("px-2 py-1", view === v ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {v === "diagram" ? "Diagram" : v === "code" ? "Code" : "Prompt"}
            </button>
          ))}
        </div>
      </div>

      {view === "prompt" ? (
        <PromptView method={method} question={question} figure={legacy ? undefined : figure} legacy={legacy} run={run} n={a.n} />
      ) : view === "diagram" ? (
        <div className="paper flex min-h-72 items-center justify-center overflow-hidden rounded-lg p-4">
          {a.svg ? (
            // Stored SVG was produced by our renderer or sanitised on the server when the run was recorded.
            <div className="w-full [&>svg]:mx-auto [&>svg]:block [&>svg]:max-h-[460px]" dangerouslySetInnerHTML={{ __html: a.svg }} />
          ) : (
            <p className="text-sm text-neutral-500">This attempt did not draw.</p>
          )}
        </div>
      ) : (
        <pre className="h-[420px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">{a.source || a.error}</pre>
      )}

      <AttemptNotes attempt={a} run={run} />
    </section>
  );
}

/** Exactly what the model received for this attempt, rebuilt from the same prompt functions the runs use. */
function PromptView({
  method,
  question,
  figure,
  legacy,
  run,
  n,
}: {
  method: Approach;
  question: string;
  figure?: string;
  legacy?: boolean;
  run: RunResult;
  n: number;
}) {
  const previous = run.attempts.filter((x) => x.n < n);
  const block = "max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed";
  const head = "mb-1.5 text-sm font-medium";
  return (
    <div className="space-y-5">
      <div>
        <div className={head}>Instructions</div>
        <p className="mb-2 text-xs text-muted-foreground">Sent with every request for this method. The same for every model.</p>
        <pre className={block}>{systemPrompt(method)}</pre>
      </div>
      <div>
        <div className={head}>Conversation for try {n}</div>
        <div className="space-y-2">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Message</div>
            <pre className={block}>{legacy ? legacyQuestionPrompt(question) : questionPrompt(question, figure)}</pre>
          </div>
          {previous.map((p) => {
            const issues = [...p.autoIssues, ...(p.visual?.issues ?? [])];
            return (
              <div key={p.n} className="space-y-2">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Model reply, try {p.n}, the code part</div>
                  <pre className={block}>{p.source || p.error || "No reply"}</pre>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Message{p.drew ? ", with the picture from try " + p.n + " attached" : ""}</div>
                  <pre className={block}>
                    {retryPrompt(issues.length ? issues : ["The picture check did not pass it, but gave no reason. Check it against the question again."])}
                  </pre>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className={head}>Picture check</div>
        <p className="mb-2 text-xs text-muted-foreground">Sent in a fresh conversation with the rendered picture of try {n} attached.</p>
        <pre className={block}>{legacy ? legacyCheckPrompt(question) : checkPrompt(question, figure)}</pre>
      </div>
    </div>
  );
}

function AttemptNotes({ attempt: a, run }: { attempt: Attempt; run: RunResult }) {
  const reason = whyNotChosen(a, run);
  return (
    <div className="mt-3 space-y-3 text-sm leading-relaxed">
      {a.n === run.chosen ? (
        <p className="text-foreground/85">
          {a.accepted
            ? "This attempt passed both checks, so it is the result."
            : "No attempt passed, so this one is shown because it had the fewest problems."}
        </p>
      ) : (
        reason && <p className="text-foreground/85">Not chosen. {reason}</p>
      )}
      {a.error && <p className="text-destructive">{a.error}</p>}
      <div>
        <div className="text-muted-foreground">Our automatic checks</div>
        {!a.drew ? (
          <p className="whitespace-pre-wrap text-destructive">{a.autoIssues.join("\n")}</p>
        ) : a.autoIssues.length ? (
          <ul className="list-disc pl-5 text-amber-200/90">
            {a.autoIssues.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
          </ul>
        ) : (
          <p className="text-foreground/80">No problems found.</p>
        )}
      </div>
      {a.drew && (
        <div>
          <div className="text-muted-foreground">The model looking at its own picture</div>
          {!a.visual ? (
            <p className="text-foreground/80">Not checked.</p>
          ) : a.visual.issues.length ? (
            <ul className="list-disc pl-5 text-amber-200/90">
              {a.visual.issues.map((i, k) => (
                <li key={k}>{i}</li>
              ))}
            </ul>
          ) : (
            <p className="text-foreground/80">{a.visual.pass ? "Passed, no problems listed." : "Did not pass, but gave no reason."}</p>
          )}
        </div>
      )}
    </div>
  );
}
