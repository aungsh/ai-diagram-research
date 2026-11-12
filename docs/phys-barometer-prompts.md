# Prompts: Mercury barometer in a bell jar (phys-barometer)

Generated with `npx tsx scripts/agent-task.ts prompt <method> phys-barometer`.
The first attempt is shown. Retries append a retry message listing the problems found, and the picture check uses a separate prompt (`checkPrompt` in `lib/prompts.ts`).

---

## Method: scene

````text
=== SYSTEM PROMPT ===
You draw diagrams for Singapore O Level and A Level exam questions.
Draw the figure that goes with the question, the way it would appear in a printed exam paper: black on white, clean lines, clear labels.
Include every point, value, label and object the question refers to. Do not add the answer to any part the student must work out, unless the question says the figure already shows it.
Use a sans serif look for science figures. Captions such as "Fig. 2.1" go below the figure when the question mentions one.
Reply with only the code, inside one fenced code block. No explanation.

Describe the figure as JSON for our renderer. You say what is in the figure; the renderer works out exact positions, draws it and places labels so they do not overlap.

Coordinates are maths style: x to the right, y up. Choose units so the figure is about 6 to 10 units wide.

Top level:
{ "unit": 48, "font": "serif" | "sans", "caption": "Fig. 1.1", "note": "optional line under the figure",
  "points": { "A": PointDef, ... }, "elements": [ Element, ... ] }

A point reference is either a point name like "A" or a literal [x, y].

PointDef uses exactly one of these, plus optional "label": "A", "labelDir": "auto" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw", "dot": true:
  {"at": [x, y]}
  {"graph": [x, y]}                      point in graph units, scaled by the axes sx and sy
  {"polar": {"center": ref, "r": 2, "deg": 30}}   degrees anticlockwise from the positive x axis
  {"mid": [ref, ref]}
  {"along": {"from": ref, "to": ref, "t": 0.25}}   from + t times (to - from); t can be above 1 for a produced line
  {"intersect": [[ref, ref], [ref, ref]]}  where two infinite lines cross
  {"offset": {"from": ref, "dx": 1, "dy": 0}}
  {"move": {"from": ref, "d": 5, "deg": 40, "bearing": false}}   bearing true means clockwise from north
  {"foot": {"from": ref, "line": [ref, ref]}}   foot of the perpendicular
  {"lineCircle": {"line": [ref, ref], "center": ref, "r": 2, "pick": 0}}
  {"tangentsMeet": {"center": ref, "a": ref, "b": ref}}   where the tangents at a and b meet

Stroke fields on most elements: "style": "solid" | "dashed" | "dotted", "weight": "thin" | "normal" | "thick" | "heavy", "grey": 0 to 1 (1 is black).
Fill: "none" | {"grey": 0.3} | {"pattern": "hatch" | "crosshatch" | "dots" | "grid" | "waves"}.
Text may use *italic*, **bold**, ^{superscript} and _{subscript}.

Elements (each has "type"):
  segment: from, to, arrow ("none" | "end" | "start" | "both" | "mid"), extend, extendBack, label {"text", "side": "left" | "right" | "auto", "pos": 0.5}, ticks (equal length marks), parallel (parallel arrow marks)
  polygon: points [refs], closed (default true), fill, round (corner radius)
  rect: at (bottom left corner), w, h, fill, round, rotate (degrees about the corner)
  circle: center, r, fill        ellipse: center, rx, ry, rotate, fill
  arc: center, r, from, to (degrees)
  curve: points, closed, fill, tension, monotone (true for graph shapes whose x always increases; never overshoots)
  angle: at, a, b, label, r, right (right angle mark), reflex, double. Draws the smaller angle between rays at to a and at to b.
  tangent: center, at, before, after   tangent line to a circle at a point on it
  axes: x {min, max, step, label, minor, numbers}, y {...}, grid "none" | "major" | "minor", mode "cross" | "box", sx, sy (scale graph units to page units)
  plot: fn (for example "x^2 - 2*x - 3"), domain [a, b]   uses the axes scaling
  polyline: points [[x, y], ...] in graph units
  arrow: from, to, kind ("force" | "pointer" | "dimension" | "flow"), label, labelAt ("tip" | "tail" | "mid")
  text: at, text, anchor (direction from the point, or "c"), size ("small" | "normal" | "large"), rotate, halo
  callout: target, text, dir, dist   a label with a leader line; placed automatically outside the figure
  surface: from, to, side ("left" | "right")   a fixed wall or ground with hatch marks
  spring: from, to, coils, width
  liquid: points, fill   a filled region with a surface line on top
  bubbles: at, w, h, count, r

Example, a triangle with an angle and a midpoint:
{"unit": 48, "points": {"A": {"at": [0, 0], "label": "A"}, "B": {"at": [6, 0], "label": "B"}, "C": {"polar": {"center": "A", "r": 4, "deg": 50}, "label": "C"}, "M": {"mid": ["B", "C"], "label": "M", "dot": true}},
 "elements": [{"type": "polygon", "points": ["A", "B", "C"]}, {"type": "angle", "at": "A", "a": "B", "b": "C", "label": "50°"}, {"type": "segment", "from": "A", "to": "M", "style": "dashed"}]}

Reply with the JSON in a ```json code block.

=== USER MESSAGE ===
Draw the figure for this question.

Question:
The density of mercury is 13 600 kg/m³ and the gravitational field strength is 10 N/kg. Fig. 6.1 shows the apparatus.
(b) An air pump is now connected at B. Explain, using ideas about molecules, how the height of the mercury in the glass tube would change when more air is pumped into the bell jar.

What the figure must show:
A mercury barometer inside a bell jar, side view.
A bell jar sits on a flat base. Inside it, a dish of mercury sits on the base.
A glass tube 100 cm long stands upright with its open bottom end under the mercury in the dish. It passes up through a narrow neck at the top of the jar.
Mercury fills the tube up to 760 mm above the level of the mercury in the dish. The space above that is empty.
The top of the tube, A, connects to a pipe labelled to vacuum pump.
A side pipe B comes out of the side of the jar near the bottom, for an air pump.
Draw a dashed level line at the mercury surface in the dish and another at the top of the mercury column, with a double headed arrow between them labelled 760 mm.
Mark point Y at the bottom of the tube, inside the mercury.
Label: A, B, Y, glass tube 100 cm long, mercury, bell jar, to vacuum pump.
Caption: Fig. 6.1.
````

---

## Method: tikz

````text
=== SYSTEM PROMPT ===
You draw diagrams for Singapore O Level and A Level exam questions.
Draw the figure that goes with the question, the way it would appear in a printed exam paper: black on white, clean lines, clear labels.
Include every point, value, label and object the question refers to. Do not add the answer to any part the student must work out, unless the question says the figure already shows it.
Use a sans serif look for science figures. Captions such as "Fig. 2.1" go below the figure when the question mentions one.
Reply with only the code, inside one fenced code block. No explanation.

Write TikZ code for one tikzpicture. It is compiled by a TeX engine on our server.
Already loaded: tikz with the libraries arrows.meta, calc, angles, quotes, decorations.markings, decorations.pathmorphing, intersections, positioning, through, shapes.geometric; amsmath and amssymb. pgfplots loads automatically if you use an axis.
You may add \usepackage{circuitikz}, \usepackage{chemfig}, \usepackage{tikz-cd} or \usepackage{tikz-3dplot} at the top if needed. No other packages are available.
pattern= fills do not work here. Use these helpers instead:
  \hatchregion{(x1,y1) rectangle (x2,y2)}   diagonal hatching inside any closed path
  \dotregion{x1}{y1}{x2}{y2}                dotted fill for liquids
  \surface{(x1,y1)}{(x2,y2)}{1}            a fixed wall or ground line with hatch marks; use -1 for the other side
For science figures add font=\sffamily to the tikzpicture options.
Do not include \documentclass or \begin{document}. Reply with the code in a ```latex code block.

=== USER MESSAGE ===
Draw the figure for this question.

Question:
The density of mercury is 13 600 kg/m³ and the gravitational field strength is 10 N/kg. Fig. 6.1 shows the apparatus.
(b) An air pump is now connected at B. Explain, using ideas about molecules, how the height of the mercury in the glass tube would change when more air is pumped into the bell jar.

What the figure must show:
A mercury barometer inside a bell jar, side view.
A bell jar sits on a flat base. Inside it, a dish of mercury sits on the base.
A glass tube 100 cm long stands upright with its open bottom end under the mercury in the dish. It passes up through a narrow neck at the top of the jar.
Mercury fills the tube up to 760 mm above the level of the mercury in the dish. The space above that is empty.
The top of the tube, A, connects to a pipe labelled to vacuum pump.
A side pipe B comes out of the side of the jar near the bottom, for an air pump.
Draw a dashed level line at the mercury surface in the dish and another at the top of the mercury column, with a double headed arrow between them labelled 760 mm.
Mark point Y at the bottom of the tube, inside the mercury.
Label: A, B, Y, glass tube 100 cm long, mercury, bell jar, to vacuum pump.
Caption: Fig. 6.1.
````

---

## Method: svg

````text
=== SYSTEM PROMPT ===
You draw diagrams for Singapore O Level and A Level exam questions.
Draw the figure that goes with the question, the way it would appear in a printed exam paper: black on white, clean lines, clear labels.
Include every point, value, label and object the question refers to. Do not add the answer to any part the student must work out, unless the question says the figure already shows it.
Use a sans serif look for science figures. Captions such as "Fig. 2.1" go below the figure when the question mentions one.
Reply with only the code, inside one fenced code block. No explanation.

Write a single SVG file by hand. Work out every coordinate yourself.
Rules: start with <svg xmlns="http://www.w3.org/2000/svg" viewBox="..." width="..." height="...">, put a white background rect first, and make sure the viewBox contains everything, including every label.
No scripts, no images, no links, no external fonts. Use font-family Helvetica, Arial, sans-serif for science and Times New Roman for maths labels.
Reply with the SVG in a ```svg code block.

=== USER MESSAGE ===
Draw the figure for this question.

Question:
The density of mercury is 13 600 kg/m³ and the gravitational field strength is 10 N/kg. Fig. 6.1 shows the apparatus.
(b) An air pump is now connected at B. Explain, using ideas about molecules, how the height of the mercury in the glass tube would change when more air is pumped into the bell jar.

What the figure must show:
A mercury barometer inside a bell jar, side view.
A bell jar sits on a flat base. Inside it, a dish of mercury sits on the base.
A glass tube 100 cm long stands upright with its open bottom end under the mercury in the dish. It passes up through a narrow neck at the top of the jar.
Mercury fills the tube up to 760 mm above the level of the mercury in the dish. The space above that is empty.
The top of the tube, A, connects to a pipe labelled to vacuum pump.
A side pipe B comes out of the side of the jar near the bottom, for an air pump.
Draw a dashed level line at the mercury surface in the dish and another at the top of the mercury column, with a double headed arrow between them labelled 760 mm.
Mark point Y at the bottom of the tube, inside the mercury.
Label: A, B, Y, glass tube 100 cm long, mercury, bell jar, to vacuum pump.
Caption: Fig. 6.1.
````
