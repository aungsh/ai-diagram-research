import { Shell } from "@/components/shell";
import { APPROACH_NAME, type Approach } from "@/lib/approaches";
import { ASSUME, estimates, MEASURED_AT, MODELS, QUESTION_COUNT } from "@/lib/estimates";

const METHODS: Record<Approach, { summary: string; steps: string[]; good: string; watch: string }> = {
  scene: {
    summary: "Claude describes the figure. Our code draws it.",
    steps: [
      "We send Claude the question and a list of the building blocks our renderer understands, such as points, lines, circles, angle marks, arrows, labels, graph axes and shaded areas.",
      "Claude replies with a description of the figure. It says what is in it and how the parts relate, for example that N is a quarter of the way from B to C, or that a line is a tangent at B. It does not work out positions itself.",
      "Our renderer checks the description, calculates every position exactly, places the labels so they do not overlap each other or the drawing, and produces the image.",
      "If something cannot be drawn, such as a point that does not exist or a label with no room, the renderer says so in plain words that can go straight back to Claude.",
    ],
    good: "Geometry is always exact, every figure has the same look, and labels are handled for Claude. Its answers are short, and once its instructions are cached it costs about the same as TikZ.",
    watch: "It can only draw what the building blocks allow. New kinds of figures, such as circuit symbols or repeated patterns, need new building blocks first. The instructions are also the longest of the three, although they can be cached.",
  },
  tikz: {
    summary: "Claude writes code in TikZ, the drawing language used with LaTeX.",
    steps: [
      "We send Claude the question and a few rules, along with some helper commands we added for things like hatched surfaces and dotted liquids.",
      "Claude writes TikZ code. TikZ has ready made tools for graphs, circuits and chemistry, and is widely used for exam and textbook figures.",
      "Our server runs a TeX engine that turns the code into an image. This usually takes well under a second.",
      "If the code has a mistake, TeX returns an error message with the line it failed on, which can go back to Claude.",
    ],
    good: "The results look like printed exam papers, and TikZ covers almost any subject. Claude knows TikZ well.",
    watch: "Some mistakes compile without any error but draw the wrong thing, so the picture itself has to be checked. The TeX engine we run on the server has limits, such as memory, that we had to work around.",
  },
  svg: {
    summary: "Claude writes the image file directly.",
    steps: [
      "We send Claude the question and a few style rules.",
      "Claude writes an SVG file, the standard format for drawings on the web. It has to work out the position of every line, curve and label itself.",
      "Our server removes anything unsafe from the file and shows it.",
    ],
    good: "No extra software is needed and it can draw any shape.",
    watch: "Every number is Claude's own arithmetic. Labels can land outside the edge of the image, and curves need hundreds of points, so the answer is the longest of the three and the hardest to edit later.",
  },
};

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);
const usd1000 = (n: number) => `$${(n * 1000).toFixed(n * 1000 < 10 ? 2 : 0)}`;

export default function HowItWorks() {
  const est = estimates();

  return (
    <Shell active="how-it-works">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-4xl font-bold tracking-tight">How it works</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          All three methods ask Claude for code instead of a picture, then draw the picture on our side. Drawing from code means the numbers
          in the question and the numbers in the figure always match. The difference is how much of the work Claude does and how much our
          code does.
        </p>

        <div className="mt-12 space-y-14">
          {(Object.keys(METHODS) as Approach[]).map((m) => (
            <section key={m}>
              <h2 className="text-2xl font-semibold">{APPROACH_NAME[m]}</h2>
              <p className="mt-1 text-muted-foreground">{METHODS[m].summary}</p>
              <ol className="mt-5 space-y-3">
                {METHODS[m].steps.map((s, i) => (
                  <li key={i} className="flex gap-4 leading-relaxed">
                    <span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                    <span className="text-foreground/90">{s}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium text-lime">Good at</h3>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/85">{METHODS[m].good}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-amber-300/90">Watch out for</h3>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/85">{METHODS[m].watch}</p>
                </div>
              </div>
            </section>
          ))}

          <section id="judging">
            <h2 className="text-2xl font-semibold">How attempts are judged</h2>
            <p className="mt-3 leading-relaxed text-foreground/90">
              Every model and every method goes through the same loop, with the same prompts. Each try is judged in two ways.
            </p>
            <h3 className="mt-6 font-semibold">1. Our automatic checks</h3>
            <p className="mt-2 leading-relaxed text-foreground/90">
              Our code runs these, so they are the same for every model.
            </p>
            <ul className="mt-3 space-y-2 leading-relaxed text-foreground/90">
              <li>Does it draw at all? The description must be valid for our renderer, the TikZ must compile, and the SVG must be a safe, readable image.</li>
              <li>For our renderer: could every label be placed without overlapping lines, other labels or shaded areas?</li>
              <li>For SVG: does any part of the drawing touch the edge of the image? That usually means a label has been cut off.</li>
            </ul>
            <h3 className="mt-6 font-semibold">2. The picture check</h3>
            <p className="mt-2 leading-relaxed text-foreground/90">
              The finished picture and the question are shown to the model in a fresh conversation, with this checklist:
            </p>
            <ol className="mt-3 space-y-2 leading-relaxed text-foreground/90">
              {[
                "Everything the question refers to is in the picture.",
                "Nothing in the picture contradicts the question, such as an angle, ratio or direction.",
                "Every label is readable and clearly attached to the right thing.",
                "Nothing is cut off, and there are no stray or broken lines.",
                "It follows exam conventions and does not give away an answer.",
              ].map((s, i) => (
                <li key={i} className="flex gap-4">
                  <span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 leading-relaxed text-foreground/90">The model answers pass or fail and lists any problems.</p>

            <h3 className="mt-6 font-semibold">Accepting, retrying and choosing</h3>
            <ul className="mt-3 space-y-2 leading-relaxed text-foreground/90">
              <li>A try is accepted only if it draws, our checks find nothing, and the picture check passes with no problems listed.</li>
              <li>If it is not accepted, every problem from both checks goes back to the model in plain words, along with the picture, and it tries again. There are at most three tries.</li>
              <li>The result shown is the first accepted try. If none passed, it is the try with the fewest problems, and it is marked as not accepted.</li>
              <li>On each question page you can open every try, see what each check found, and why it was not chosen.</li>
            </ul>
            <p className="mt-5 leading-relaxed text-muted-foreground">
              One limit to keep in mind: each model judges its own pictures, so a model that is easy on itself will look better than it is. The
              hand checked reference set was reviewed by eye instead. A fairer next step is to have one strong model judge every model&apos;s
              pictures.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold">Cost and time</h2>
            <p className="mt-3 leading-relaxed text-foreground/90">
              These are estimates for one finished diagram, including the check and the average number of tries each method needed across
              the {QUESTION_COUNT} questions in this demo. Answer lengths and drawing times were measured on{" "}
              {new Date(MEASURED_AT).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
            </p>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-3 font-normal">Method</th>
                    <th className="pb-3 font-normal">Answer length</th>
                    <th className="pb-3 font-normal">Average tries</th>
                    {MODELS.map((m) => (
                      <th key={m.id} className="pb-3 font-normal">
                        {m.name}
                      </th>
                    ))}
                    <th className="pb-3 font-normal">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {est.map((e) => (
                    <tr key={e.method} className="border-t border-border">
                      <td className="py-3 font-medium">{APPROACH_NAME[e.method]}</td>
                      <td className="py-3 text-foreground/80">{e.answerTokens.toLocaleString()} tokens</td>
                      <td className="py-3 text-foreground/80">{e.avgTries.toFixed(1)}</td>
                      {MODELS.map((m) => (
                        <td key={m.id} className="py-3">
                          {usd(e.cost[m.id])}
                          <span className="block text-xs text-muted-foreground">{usd1000(e.cost[m.id])} per 1,000</span>
                        </td>
                      ))}
                      <td className="py-3 text-foreground/80">about {Math.round(e.seconds)} s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              {est.map((e) => (
                <div key={e.method}>
                  <h3 className="text-sm font-medium">{APPROACH_NAME[e.method]}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Instructions sent each time: about {e.instructionTokens.toLocaleString()} tokens. Drawing on our side:{" "}
                    {e.drawMs < 10 ? "a few milliseconds" : `about ${Math.round(e.drawMs)} ms`}.
                  </p>
                </div>
              ))}
            </div>

            <h3 className="mt-10 font-semibold">What this means</h3>
            <div className="mt-2 space-y-3 leading-relaxed text-foreground/90">
              <p>
                At these sizes every method costs well under ten cents a diagram on Claude Opus 5.5, so cost is not what decides between them.
                Accuracy and how often a drawing needs fixing matter far more.
              </p>
              <p>
                Most of the time goes to Claude writing and thinking, not to drawing. The slowest drawing step, TikZ, usually takes less than a
                second.
              </p>
              <p>
                Claude Haiku 5.5 would be by far the cheapest, but we have not tested whether its drawings are as accurate. That is worth
                measuring before relying on it.
              </p>
            </div>

            <h3 className="mt-10 font-semibold">How we worked this out</h3>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Prices are Claude API list prices per million tokens: Opus 5.5 at $4 in and $20 out, Sonnet 5.5 at $2 and $10, Haiku 5.5 at $0.10 and $0.50.</li>
              <li>We counted one token for every {ASSUME.charsPerToken} characters of code. The real count will differ a little.</li>
              <li>Claude thinks before it answers. We assumed the thinking is about as long as the answer itself.</li>
              <li>Each check shows Claude the picture, which we counted as about {ASSUME.checkInputTokens} tokens in and {ASSUME.checkOutputTokens} out.</li>
              <li>A retry also resends the previous answer and the problem with it.</li>
              <li>
                Output speed is not published, so the times assume about {ASSUME.tokensPerSecond} tokens a second plus {ASSUME.requestOverheadS} seconds
                per request. These times are placeholders until we can measure them with an API key.
              </li>
              <li>Repeated instructions can be cached, which makes them about ten times cheaper. These estimates leave caching out, so real costs should be lower.</li>
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}
