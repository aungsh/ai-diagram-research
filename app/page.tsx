import Link from "next/link";
import { connection } from "next/server";
import { Shell } from "@/components/shell";
import { allRuns, RUN_NOTES, testedModels } from "@/lib/results";
import { APPROACH_NAME, APPROACHES, listPresets, SUBJECTS, tries, type Approach } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

const ABOUT: Record<Approach, string> = {
  scene: "Claude describes what is in the figure and our own code draws it. The geometry is exact and labels are placed so they do not overlap.",
  tikz: "Claude writes TikZ, the drawing language used with LaTeX, and we turn it into an image on the server.",
  svg: "Claude writes the image file directly and works out every position itself.",
};

export default async function Overview() {
  // Results are read from disk on each request, so new runs show up without a rebuild.
  await connection();
  const presets = listPresets();
  const models = testedModels().map((m) => {
    const runs = allRuns(m.id);
    const by = (a: Approach) => runs.filter((r) => r.method === a);
    return {
      ...m,
      cells: APPROACHES.map((a) => {
        const rs = by(a);
        return {
          a,
          ran: rs.length,
          first: rs.filter((r) => r.accepted && r.chosen === 1).length,
          later: rs.filter((r) => r.accepted && r.chosen > 1).length,
          failed: rs.filter((r) => !r.accepted).length,
        };
      }),
    };
  });

  return (
    <Shell>
      <div className="mx-auto max-w-4xl">
        <h1 className="text-4xl font-bold tracking-tight">Diagram Lab</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          Claude drew the figure for each of these {presets.length} exam questions in three different ways. We checked every drawing and fixed the
          ones that were wrong. Open a question to compare them.
        </p>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {APPROACHES.map((a) => (
            <div key={a}>
              <h2 className="font-semibold">{APPROACH_NAME[a]}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{ABOUT[a]}</p>
              <p className="mt-3 text-sm">
                <span className="text-lime">{presets.filter((p) => tries(p, a) === 1).length}</span>
                <span className="text-muted-foreground"> of {presets.length} right first time</span>
              </p>
            </div>
          ))}
        </div>

        {models.length > 0 && (
          <section className="mt-14">
            <h2 className="text-2xl font-semibold">Model test</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Each model drew every question with every method through the same loop: up to three tries, each checked by our code and by the
              model looking at its own picture. <Link href="/how-it-works#judging" className="text-foreground underline underline-offset-4">How attempts are judged</Link>.
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-3 font-normal">Model</th>
                    {APPROACHES.map((a) => (
                      <th key={a} className="pb-3 font-normal">
                        {APPROACH_NAME[a]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.id} className="border-t border-border align-top">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.runBy.startsWith("Claude Code") ? "Run as a Claude Code helper agent" : "Run through the Gemini API"}</div>
                      </td>
                      {m.cells.map((c) => (
                        <td key={c.a} className="py-3 pr-4">
                          {c.ran === 0 ? (
                            <span className="text-muted-foreground">Not run yet</span>
                          ) : (
                            <>
                              <div>
                                <span className="text-lime">{c.first + c.later}</span>
                                <span className="text-muted-foreground"> of {c.ran} accepted</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {c.first} first try, {c.later} after retries, {c.failed} not accepted
                                {c.ran < presets.length ? `. ${presets.length - c.ran} still to run` : ""}
                              </div>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 space-y-4">
              {models
                .filter((m) => RUN_NOTES[m.id]?.length)
                .map((m) => (
                  <div key={m.id}>
                    <h3 className="text-sm font-medium">Notes on {m.name}</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                      {RUN_NOTES[m.id].map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </section>
        )}

        <h2 className="mt-14 text-2xl font-semibold">Hand checked reference set</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Before the model test, Claude Opus 5.5 drew every question in a coding session, and each drawing was reviewed by eye and fixed by hand.
        </p>
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-3 font-normal">Question</th>
              {APPROACHES.map((a) => (
                <th key={a} className="w-32 pb-3 font-normal">
                  {APPROACH_NAME[a]}
                </th>
              ))}
            </tr>
          </thead>
          {SUBJECTS.map((s) => (
            <tbody key={s}>
              <tr>
                <td colSpan={4} className="pt-6 pb-2 text-xs text-muted-foreground">
                  {s}
                </td>
              </tr>
              {presets
                .filter((p) => p.subject === s)
                .map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2.5 pr-4">
                      <Link href={`/p/${p.id}`} className="hover:text-lime">
                        {p.title}
                      </Link>
                    </td>
                    {APPROACHES.map((a) => {
                      const t = tries(p, a);
                      return (
                        <td key={a} className={cn("py-2.5", t === 1 ? "text-foreground/80" : "text-amber-300/90")}>
                          {t === 1 ? "First try" : `Try ${t}`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>

        <p className="mt-10 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          These drawings were made by Claude in a coding session, not through the API yet. Some fixes were mistakes by Claude and some were
          gaps in our own renderer. The notes on each question explain which.
        </p>
      </div>
    </Shell>
  );
}
