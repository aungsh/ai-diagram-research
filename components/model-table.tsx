import Link from "next/link";
import { APPROACH_NAME, APPROACHES, type Approach } from "@/lib/approaches";
import { allRuns, RUN_NOTES, testedModels, type RoundId } from "@/lib/results";

/** Accepted counts per model and method for one round of the model test. */
export function ModelTable({ round, total }: { round: RoundId; total: number }) {
  const models = testedModels(round).map((m) => {
    const runs = allRuns(m.id, round);
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
  if (!models.length) return <p className="mt-4 text-sm text-muted-foreground">No results in this round yet.</p>;

  return (
    <>
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
                          {c.ran < total ? `. ${total - c.ran} not run` : ""}
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
      <div className="mt-5 space-y-4">
        {models
          .filter((m) => RUN_NOTES[round][m.id]?.length)
          .map((m) => (
            <div key={m.id}>
              <h3 className="text-sm font-medium">Notes on {m.name}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                {RUN_NOTES[round][m.id].map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Open any question and pick a model to see every try. <Link href="/how-it-works#judging" className="text-foreground underline underline-offset-4">How attempts are judged</Link>.
      </p>
    </>
  );
}
