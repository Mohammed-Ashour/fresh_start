---
name: mo-presentation
description: Build Mohamed's presentations as technical, story-driven, Excalidraw-style, sourced decks with purposeful visuals, delivered as an editable PowerPoint (.pptx). Use this whenever he asks for a presentation, deck, slides, a talk, a tech talk, a design review deck, a pitch, or wants to turn a doc, blog post, RFC or notes into slides, even if he does not say PowerPoint.
---

# Mo presentation

The output is always a .pptx file that opens and edits cleanly in PowerPoint on macOS, because the deck gets shared and other people will change it. Everything on a slide must be a native PowerPoint object (text box, shape, connector, chart, table). A picture of a diagram or chart defeats the purpose, since nobody can fix a typo in it. The one exception is an animated GIF that shows a change in motion (see Motion), and its editable native version stays in the appendix.

If a pptx skill is available in the session, load it and use its build mechanics, gotchas and QA steps. This skill decides the story, the look, the voice and the sourcing. Where the two disagree on design (palette, fonts, decoration), this skill wins.

## Workflow

1. Collect the material first: what he gave you, plus research for anything that describes the outside world.
2. Write the storyline as a list of slide titles. Check it reads as a story on its own before building anything.
3. For each slide, decide whether a visual adds information. Use a chart, diagram or GIF only when it explains a comparison, mechanism or change; otherwise use a text-only slide.
4. Write the text in his voice.
5. Attach sources.
6. Build the .pptx, render it, look at every slide, fix what is broken.
7. Deliver the .pptx. Mention anything left unsourced.

If the audience or the goal of the deck is unclear and a wrong guess would change the story, ask one short question before building. Otherwise make the call and say which reading you took.

## Storyline

A deck is an argument told in order, not a container of topics. Default arc:

1. Hook: the situation or problem the audience already recognises
2. Why it matters: the cost of leaving it alone, ideally one number
3. The idea: the proposal or insight in one sentence
4. How it works: 2 to 5 slides, each one step forward. In a deck about changes, each change slide is followed by a "how it works" slide (see Technical background slides)
5. Proof: data, a real example, a before and after
6. Tradeoffs: what this costs, where it does not fit. He values honest tradeoffs over selling, so do not skip this
7. The ask or next step
8. Takeaways: 2 to 4 main points on 1 slide, 2 at most, in a grid, each showing its change (see Takeaways and review)
9. Review: the final presented slide, all main points on one screen, the ones that must stick
10. Sources and appendix, after the review, as backup slides

Adapt the arc to the deck. A short update does not need every beat.

Rules that make it a story:
- One message per slide. If a slide needs two titles, it is two slides.
- Titles state the technical finding, mechanism or constraint, rather than a topic label or a conversational punchline. Examples: "Deferral releases worker slots but adds a resume path" and "Pod disruption protection prevents node consolidation". Reading only the titles should explain the investigation in order.
- Show the measured problem in the first one or two slides. For a capacity/latency mismatch, show both quantities together. Label schematic activity as illustrative; aggregate CPU measurements do not identify idle individual nodes or prove safe removable capacity.
- Each slide should raise the question the next one answers.
- Detail that supports but does not advance the story goes into speaker notes or an appendix.

## Text

Keep it simple and calm. The slide supports the speaker, it does not replace him.

- Title: one line, up to about 10 words.
- Context line: a short, muted scope statement under the title. Identify the system, configuration, measurement window or dependency boundary. Avoid conversational lead-ins, rhetorical questions and sentences that repeat the title.
- Explanation: complete technical sentences on the left, following the structure below. Paragraphs are preferred over summary fragments.
- Define unfamiliar terms and metrics before relying on them. Preserve exact configuration names and distinguish related concepts, such as CPU utilization versus allocatable capacity, and task pools versus node pools.
- Put detailed evidence, additional qualifications and implementation references in speaker notes. Do not remove the explanation from the slide just to satisfy a tiny word budget.

### Technical explanation structure

For an engineering audience, explain what the component is, how it operates, and why the mechanism affects the measured result or proposed change.

Use two or three short paragraphs, usually about 60 to 110 words in total. This is a guide, not a quota. If the explanation cannot fit comfortably, split it or move secondary details into notes rather than shrinking the font.

1. Define the component, metric or dependency and its role.
2. Explain execution behavior or the causal mechanism. Name the actor and the operation.
3. State the measured effect, limitation or operational prerequisite, including comparison scope where relevant.

For a sequence, use numbered sentences that match the diagram's step badges. Every numbered badge must have a corresponding explanation step. A plan may be a numbered list without a diagram.

Do not force text into labels such as "What we saw", "Why nodes stayed", "Different fixes" or "What it means". These produce summary notes instead of a technical explanation. Avoid mandatory all-caps mini-headings.

Example:

> Karpenter consolidation evaluates terminating or replacing nodes to reduce compute cost while preserving pod scheduling requirements.
>
> An active pod with `karpenter.sh/do-not-disrupt` excludes its node from consolidation. Frequent arrivals of protected pods can maintain this exclusion despite low CPU utilization.
>
> Removing protection permits more disruption and can cause retries. Memory, scratch-disk throughput and publication recovery must be evaluated before changing the policy.

### Show the command

Engineers trust a number more when they can see where it came from. Where possible, put the real command, query, API call or config change behind the slide in a small command chip at the bottom of the explanation panel.

- Examples: the REST API call that fetched the runs, the PromQL query, the `aws cloudwatch` metric, the CLI invocation, the one-line config diff (`deferrable=False`, `poll_interval 30 → 10`).
- Take it from the actual scripts, repo or PR. Never invent a command. If none exists, leave the chip out.
- Shorten long ones with `…`, keep the part that identifies the data. One to three lines.
- Monospace `Menlo` 9 to 10pt on a very light grey chip (`F1F3F5`, no outline).

### Cutting slides

- A slide that only says "this is broken and we do not know why" reads odd on its own and stalls the story. Unless he asks for it, put an open problem in the next-steps slide and the notes, with what we know so far.
- If he says a slide feels weird, remove it rather than patch it, and check the slide before and after still connect.

### His voice

For engineering presentations, use neutral, precise technical prose. The narrative comes from slide order; the sentences define mechanisms and explain causality rather than sound like a casual talk.

- Use complete declarative sentences. Vary sentence length when needed to explain a condition or dependency.
- Name the component and operation: "The triggerer polls pod status" rather than "We keep an eye on the pod". Use "I", "we" or "you" only when attribution or an instruction requires it, not as a default framing.
- Concrete over abstract: names the requirement, the budget, the timeline, the failure, instead of talking about "challenges".
- Honest about limits and context. "It depends" is allowed when followed by what it depends on.
- Dry humor is fine when it comes naturally. Never forced.
- Never use em dashes. Use a period, a comma, or rewrite.
- No corporate or brochure wording: leverage, unlock, seamless, robust, game changer, empower, cutting edge, journey.
- No AI tells: "it's not X, it's Y" constructions, rule of three lists for rhythm, rhetorical question plus instant answer, "let's dive in", inflated significance.
- No emojis unless he asks.

If humanizer or unslop is available, apply it to slide text and notes as a final pass. Remove filler and artificial phrasing without replacing precise engineering language with conversational slogans or stripping out definitions and causal detail.

## Layout: golden ratio grid and templates

Every slide uses the same grid, so the eye always knows where to look. Values for a 13.333 x 7.5 in slide:

- Margins 0.6 in left and right. Content width about 12.1 in.
- Header band: title at y 0.35, context line at y 1.0, both full width.
- Content band: y 1.8 to 6.75.
- Golden split of the content band: technical explanation on the left 38.2% (about 4.5 in), gutter 0.35 in, supporting GIF/chart/diagram on the right 61.8% (about 7.3 in). The explanation starts at x 0.6; the visual starts at about x 5.45.
- Inside the left column, place the paragraphs from the top and the command chip at the bottom. Keep a clear gap between them.
- When no visual adds information, use a text-only layout with a wider left-aligned body. Do not leave an empty visual placeholder or add decorative boxes to fill the space.
- Source line at y 6.95, full width, only when the slide has linked sources.
- A visual sits inside its zone with air around it. It never fills the zone edge to edge.

Build these as real slide layouts in the file, so he can add a slide in PowerPoint and get the same grid:

| Layout | Placeholders | Use for |
|---|---|---|
| Title | title, subtitle, footer line | first slide |
| Technical text + visual | title, context, explanation on left (38.2%), visual on right (61.8%), left-column command chip, source | slides where a visual explains the mechanism or evidence |
| Technical explanation | title, context, wider left-aligned body, optional source | definitions, constraints or plans that do not benefit from a figure |
| Full visual | title, context, full width visual zone, one-line caption, source | exceptions where a wide diagram or timeline genuinely requires the width |
| Full visual, as takeaway grid | title, context, one row per takeaway (text 38.2%, GIF or chart 61.8%), caption | 1 slide, 2 at most |
| Full visual, as review | title, context, 2 to 4 takeaway cards, a next-step strip | final presented slide |
| Sources | title, numbered list | backup, after the review |

- Explanation placeholders use normal body-text paragraphs, not an alternating all-caps-label/body template. Numbered paragraphs may correspond to diagram steps.
- Rebuild visuals at their actual column dimensions instead of shrinking a wide figure and making its labels unreadable. Recheck GIF callout spacing throughout the transition, not just at the endpoints.
- Remove the default layouts he will not use. Remove empty visual placeholders on generated slides after placing the chart or diagram.

## Graphs and diagrams

A visual is optional. Use one when it adds a comparison, spatial relationship, execution sequence or change that the text alone would not explain as clearly. Do not turn every definition into a chart or repeat the paragraph as a row of boxes. When a visual adds value, choose by what the idea is:

| The idea is about | Use |
|---|---|
| Numbers over time | Native line chart |
| Comparing a few values | Native bar chart, sorted |
| One number that matters | Big number with a short label |
| A process or pipeline | Boxes and arrows, left to right |
| System architecture | Boxes grouped in zones, labelled arrows |
| Before vs after, option A vs B | Two side by side sketches |
| A decision | Small tree or 2x2 |
| A timeline or plan | Horizontal line with markers |

- Charts are native PowerPoint charts so the data stays editable. Strip them down: no chart border, no gridlines, direct labels instead of a legend where possible.
- Keep charts modest. A chart fills its zone with some air, never the whole slide. Chart text 10 to 11pt.
- Diagrams are built from native shapes and connectors, never pasted as an image. Group the shapes of one diagram so it moves as a unit.
- Maximum about 7 boxes per diagram. If it needs more, split it over two slides and build it up.
- Never invent data to fill a chart. If there are no measured numbers, a labelled mechanism diagram may help; otherwise keep the slide text-only.

### Text placement in charts

Labels must never touch or cross each other, a bar edge, the axis or the slide grid. Check this on every chart before delivering.

- No automatic chart title. A single-series chart in python-pptx and PowerPoint gets the series name as a title by default, so turn it off. The slide title carries the message.
- Clean number formats: `0" s"`, `0.0" s"`, `0%`. Never a format that can render `11. s`.
- Outside-end labels need headroom: set the value axis maximum to about 1.25 times the largest value, so the label of the longest bar stays inside the chart.
- Stacked bars: label a segment only if it is at least about 8% of the axis. A smaller segment gets no label; put its value in the category name instead (`discover-tiles (sync, +0.3 s)`) or in the explanation.
- Horizontal bars read top to bottom in the order you list them (reverse the category axis), sorted so the focus is easy to find.
- Category names short, about 25 characters at most. Long names collide with the plot; shorten them or move detail to the explanation.
- Legend at the top only when there are two or more series, and never over the plot. Prefer direct labels.
- Never put a text box on top of a native chart's plot area. The only shape allowed to enter the plot is a callout arrow, and only with a fixed plot area so its target is computed (see Focus). Callouts go in the reserved callout column or strip (see Focus); longer notes go in the explanation panel.

### Focus: callouts, not "look at" lines

Every chart points the listener at one thing, with color and a callout. No "Look at: ..." sentences.

- **Color:** the one bar, segment or line point that carries the message gets the focus color (strong version of its color, bold label). Everything else stays in its normal pastel or mist grey. One focus per chart.
- **Callout:** a short phrase that states the takeaway (`22 s of Airflow for 4 s of work`, `Mosaic: 33 s to 13 s`), in the focus stroke color, plus one 1.25pt arrow in the same color pointing at the focus element. A phrase, not an instruction: never "look at" or "note that".
- **Where the callout goes:** only in free space, so neither the text nor the arrow crosses another bar, label or legend.
  - Horizontal bars: reserve the right part of the chart (about 25% of its width) as a callout column. The text sits there level with the focus bar, and the arrow runs left along the bar's own row to stop just past its data label.
  - Columns and lines: reserve a strip above the plot (about 24% of the chart height) and put the legend at the bottom. The text sits in the strip above the focus column, and the arrow drops straight down to just above its data label.
  - A middle segment of a stacked bar: text in the strip above, arrow straight down to the segment.
  - Line charts: text in the empty area beside the point (usually after the last point of a short series), arrow to the point.
- **How to place it exactly:** give the chart a fixed plot area (`c:manualLayout`, `layoutTarget inner`, edge mode) and set the value axis maximum yourself. Then bar positions follow from the category count, gap width and overlap, and the arrow can be computed instead of guessed. Do not rely on PowerPoint's automatic plot layout for anything a callout points at.
- The arrow stops about 0.1 in short of the bar end or label. It never touches them.
- The explanation names the same component or metric as the callout and explains its mechanism or comparison scope.
- For diagrams, the focus is a box or arrow in the strong color, with a callout phrase next to it if needed. In a GIF, draw the callout on the final frame.

### Motion: GIFs for change

When the point of a slide is a change (bars moving earlier, a wait shrinking, a gate moving), show it in motion with an animated GIF instead of two static panels.

- Generate the GIF in the deck script from the same data and the same palette, fonts and grid as the native visuals. Never a screen recording.
- Simple motion: hold the before state about 1.5 s, move to the after state in about 1 s, hold the after state about 2.5 s, loop. Only the thing that changes moves.
- Label the state on the frame ("Before" then "After R12") so a screenshot still makes sense.
- Render at about 150 dpi for the visual zone so it stays sharp on a projector. Keep it under about 2 MB.
- Keep the editable native version of the same visual on an appendix slide, and say so in the notes.
- At most one or two GIFs in the body of the deck, plus one per takeaway. Everything else stays static and native.

## Technical background slides

For an engineering audience, every change slide is followed by one slide that shows how that part of the system works, so the change makes sense mechanically.

- Layout: Technical text + visual. Numbered explanation sentences on the left, a supporting diagram on the right, and real code/config in the left-column command chip. Use text-only if a diagram would merely repeat the explanation.
- Title: the mechanism as a technical statement, such as "Deferral releases worker slots but adds a resume path". The scope line identifies the relevant change or setting without a generic "Background for..." introduction.
- Diagram: the components that take part, grouped in dashed zones by system (Kubernetes, Airflow, the database, the cloud service). Zone labels go top-right inside the zone, because step badges sit top-left of the boxes.
- Numbered badges on diagram boxes follow execution order. The left explanation uses matching numbered sentences, with enough detail to state what each actor does and what triggers the next step.
- Color: components in slate, the hops that cost time in rose, what the change does in sage. Stage colors only when the box is a pipeline stage.
- When the change is a before and after of the mechanism, show both as two lanes on the same slide (before on top, after below), each with its own small title.
- Every value on the slide (poll interval, image, resource request, setting) comes from the code or the PR. Read the code before drawing.
- Keep it to about 7 boxes plus zones. If the mechanism needs more, the slide is about two mechanisms.

## Takeaways and review

Every deck ends with what the listener should walk away with, before the sources.

- **Pick 2 to 4 takeaways.** Each is a sentence you want people to repeat in the next meeting. If you have more, they are not all takeaways.
- **Takeaways fit on 1 slide, 2 at most.** Put them in a grid, not one slide each:
  - 2 or 3 takeaways: one slide, one row per takeaway. Golden split per row: the takeaway on the left (38.2%, a number badge, the sentence, one muted line of context), its visual on the right (61.8%).
  - 4 takeaways: two slides with two rows each, or one slide as a 2 x 2 grid if the visuals stay readable.
  - Rows share one height and one baseline grid, with about 0.1 in between, so the GIFs line up.
  - Each visual shows the change behind its takeaway. If there is a before and after, use a compact GIF built for the row size (bar, before marker, callout, small state label; no legend, put the color meaning in the row text). Otherwise use the single native chart that proves it, with its focus and callout.
  - The slide title is a statement covering all the takeaways, not "Takeaways".
- **No new data.** Takeaways reuse numbers already shown in the deck, so the audience recognises them. Same colors as the slide where the number first appeared.
- **Review slide, the last one presented.** All takeaways on one screen as 2 to 4 cards: a big number, the takeaway in one short line, and the color of its takeaway slide. Under them, one strip with the next step or the ask. Nothing new, no paragraphs. This slide stays up during questions, so it must make sense on its own.
- Sources and the appendix come after the review slide as backup. Say in the notes that the talk ends on the review.
- The GIFs for the takeaways count toward the GIF budget. Prefer GIFs here over the body of the deck.

## Color language

One color language across the whole deck. A color means the same thing on every slide, in charts and in diagrams.

- **Categories** (stages of a pipeline, components, teams): give each category its own pastel hue the first time it appears, usually on the diagram that introduces them, and reuse it everywhere. A stacked bar of time per stage uses the stage colors. A diagram box for a stage uses the stage color. Never reuse a category hue for something else.
- **Semantic colors** sit next to the categories and never change meaning:
  - Before / baseline: mist grey
  - After / improvement: sage green
  - Waiting, overhead, problem: dusty rose
  - Generic work, when no single category applies: slate
- At most about 5 category hues plus the 4 semantic colors. If you need more categories, group them.
- Earlier or secondary instances (for example the previous date in a timeline) use a lighter tint of the same hue, not a new color.

## Look: calm Excalidraw style

Use clean technical sketches with white space, soft pastel fills, thin outlines and standard typography. The diagrams retain the restrained Excalidraw-style composition; the text uses Aptos rather than a hand-drawn font.

- Slide size: 16:9 widescreen.
- Background: white `FFFFFF`. No gradients, no background images, no shadows, no decorative bars or stripes, no underline under titles.
- Ink (text): `343A40`. Muted text (context, labels, captions, sources): `868E96`. Hairlines and axes: `DEE2E6`.
- Pastel palette, fill with a matching darker stroke:

| Role | Fill | Stroke |
|---|---|---|
| Category 1, sky | `A9CDEB` | `4A7FB0` |
| Category 2, peach | `F5C29C` | `C07A45` |
| Category 3, lavender | `CBBDEB` | `7A64B0` |
| Category 4, mint | `B3E0CA` | `4E9474` |
| Category 5, sand | `E6D3A8` | `9C8450` |
| Before, mist grey | `D5DAE0` | `98A2AD` |
| After, sage | `9FD3AE` | `4A9162` |
| Waiting / problem, dusty rose | `EFAFAF` | `C05656` |
| Generic work, slate | `B4C3D6` | `6A7F9A` |

- These are pastels with some strength. Washed-out near-white fills disappear on a projector; go no lighter than this table.
- Focus color: the fill pushed about 40% toward its own stroke. Only the focus element gets it (see Focus).

- Shapes: rounded rectangles and ellipses, 1 to 1.25pt outline in the stroke of their fill. Arrows are 1.25pt connectors in ink or muted grey with a simple arrowhead.
- Strong color is only for text that must pop, such as one hero number, and then use the stroke shade, not a saturated red or blue.
- Lots of empty space. If a slide feels full, cut content instead of shrinking it.

### Fonts

- Titles: `Aptos SemiBold`. Body, explanation, diagram labels, chart labels, sources and notes: `Aptos` regular. Fallbacks: `Arial Bold` for titles and `Arial` for other text. Commands stay in `Menlo`.
- Regenerate GIFs with the same Aptos faces used in native slide objects. Do not leave old hand-drawn fonts inside animations after changing the deck typography. On macOS, Office bundles Aptos under its application resources; locate those files rather than silently substituting a different raster font.
- Calm sizes: title 22 to 24pt, context line 12pt, explanation paragraphs 12 to 13pt (about 14pt in the wider text-only layout), diagram labels 12 to 14pt, chart labels 10 to 11pt, commands 9 to 10pt, sources 9pt (links only), hero numbers 60 to 80pt. Keep one font scale constant in the generator so the whole deck can be resized in one place.
- Aptos ships with current Microsoft Office. For recipients using older software without Aptos, use the Arial fallback or enable font embedding where permitted. Mention font availability only when it affects the delivery.

Leave about 15% slack in text boxes and recheck wrapping after any font change. A renderer without the actual font cannot verify exact text fit.

## Sources

Sources are links. A source line that only names a system or a date ("Airflow REST API, staging, 26 Oct 2026") adds noise and nobody can follow it, so leave it out.

- On the slide: one muted 9pt line at the bottom, only when there is a real URL: `Source: ` followed by short clickable labels (`orchestration #222`, `Airflow docs: Deferrable Operators`). Each label carries its hyperlink.
- No URL, no source line. Internal measurements without a link (run history, metrics, a local report) get no source line on the slide. Say where the numbers come from in the speaker notes instead.
- Sources slide, after the review slide: a numbered list of the linked sources only, with title, publisher, date and the full URL as a clickable link. No entries without a URL.
- Prefer primary sources (docs, papers, PRs, official reports, the vendor's own numbers) over blog summaries.
- Look sources up, do not cite from memory. Check the page really says what the slide claims and that the link opens.
- His own experience or opinion: no source needed, but phrase it as his view, not as fact.
- External claims still need a link. If you cannot find one, drop the claim or mark it "unsourced" in the speaker notes, and list those slides for him at delivery. Never make up a citation or a URL.

## Building the file

Use a scripted generator that runs on macOS and writes native objects: `pptxgenjs` (Node) or `python-pptx` (Python, run with `uv`). Use whichever is available. Do not use tools that export slides as images (Marp or reveal exports, HTML to PDF to PPTX), because the result is not editable.

- Set the theme fonts and build the layouts from the layout section in the file itself, so he can restyle in one place and add slides that match.
- Keep the palette, the category-to-color map, the grid numbers and the font scale as named constants at the top of the generator.
- Real placeholders for titles, context and explanation so outline view and accessibility work.
- Charts via the library's native chart API. Diagrams via shapes and connectors with meaningful object names.
- Speaker notes on every content slide.
- Keep the generator script next to the .pptx so the deck can be rebuilt after data changes.
- File name: short, lowercase, hyphenated topic, for example `pipeline-reprocessing.pptx`.

## Check before delivering

1. Render the deck to images (LibreOffice headless to PDF, then to images) and look at every slide. On his Mac, PowerPoint and Keynote AppleScript exports hang or fail silently because of sandbox dialogs, so do not rely on them. If LibreOffice is not installed, ask him to open the file himself or to approve installing it.
2. Fix text overflow, overlaps, arrows crossing labels, uneven spacing, anything touching the slide edge or leaving the grid.
3. Read only the titles in order. Do they tell the story?
4. Content slides use technical definitions, execution mechanics and causal explanations. Text is left-aligned in the left column; supporting visuals are on the right unless a full-width exception is justified. Context identifies scope, not a conversational lead-in. Commands are shown when they add implementation detail.
5. Color check: every category has one hue across all slides, semantic colors keep their meaning, nothing saturated outside a single hero number.
6. Chart check: no automatic chart titles, no label touching another label or a bar edge, no text box over a plot area, every chart has one focus with a callout arrow in free space, and no "look at" text.
7. Each GIF has an editable native version (in the appendix, or for a takeaway the chart earlier in the deck) and its last frame matches the static numbers.
8. Each change slide is followed by its technical background slide, with numbered badges matching the explanation steps.
9. Takeaway check: 2 to 4 takeaways on 1 slide (2 at most) in an aligned grid, each with a GIF or a native chart of numbers already in the deck, then a review slide that works on its own as the last presented slide.
10. Every visual adds information beyond the prose; remove redundant charts and flow boxes. Text-only slides are valid. Every external claim has a linked source and an entry on the Sources slide; no slide has a source line without a URL.
11. Search all text and notes for em dashes and the banned words. Remove them.
12. Confirm nothing that should be editable is an image, apart from the GIFs.

Deliver the .pptx with one or two lines: what the story is, and what still needs him (unsourced claims, numbers to confirm, the font note).
