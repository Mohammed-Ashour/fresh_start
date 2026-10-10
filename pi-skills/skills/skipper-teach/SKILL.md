---
name: skipper-teach
description: "create one focused, incremental, offline html lesson for a concrete data-engineering or platform-engineering topic such as airflow idempotency, terraform module boundaries, raster crs handling, python i/o boundaries, kubernetes probes, database migrations, ci/cd safety, or data contracts. use when the user asks to learn, practice, or receive a skipper school lesson with a mental model, visual explanation, small exercise, verification, reference card, and trusted sources. use an existing .skipperschool workspace when available. do not perform repository review, audit, remediation, or broad multi-topic curriculum design unless explicitly requested."
---

# Skipper Teach

## Goal

Teach one focused concept through an incremental offline HTML lesson that moves the reader through:

```text
understand -> recognize -> fix -> verify -> apply
```

Keep the lesson narrow enough to practice in one sitting. Teach YAGNI and KISS without simplifying away correctness, security, recovery, observability, contracts, or scientific semantics.

## Instruction priority

Use this order when instructions compete:

1. Match the user's stated focus and current level.
2. Teach accurate behavior using verified primary sources.
3. Provide a practical mental model and smallest safe application.
4. Keep the lesson offline, accessible, and easy to verify.
5. Avoid adjacent topics and decorative complexity.

## Engineering references

Treat the bundled references as canonical policy for the active lesson boundary. Read [references/core-principles.md](../skipper-core/references/core-principles.md) before non-trivial lesson work, then read only the stack references needed to teach a live decision:

- [references/python.md](../skipper-core/references/python.md)
- [references/airflow.md](../skipper-core/references/airflow.md)
- [references/scientific-geospatial.md](../skipper-core/references/scientific-geospatial.md)
- [references/terraform.md](../skipper-core/references/terraform.md)
- [references/kubernetes.md](../skipper-core/references/kubernetes.md)
- [references/ci-cd.md](../skipper-core/references/ci-cd.md)
- [references/databases-migrations.md](../skipper-core/references/databases-migrations.md)
- [references/data-pipelines-contracts.md](../skipper-core/references/data-pipelines-contracts.md)
- [references/observability-recovery.md](../skipper-core/references/observability-recovery.md)
- [references/security.md](../skipper-core/references/security.md)

Do not load inactive stack references. When repository policy conflicts with a default in these references, preserve the repository contract unless it is the source of the lesson's problem or violates an explicit requirement or safety invariant.

## Workflow

### 1. Establish focus and outcome

Infer the focus from the request and current context when it is specific enough. Ask `What should the lesson focus on?` only when no focused topic can be identified.

Define one observable outcome, for example:

- recognize whether an Airflow task is idempotent
- choose whether a Terraform module adds a real boundary
- verify CRS, nodata, and alignment before raster calculation
- distinguish readiness from liveness in a Kubernetes workload

Do not combine several independent topics into one lesson.

### 2. Inspect prior learning context

When a repository workspace is available, inspect:

```text
.skipperschool/GLOSSARY.md
.skipperschool/learning-records/*.md
```

Use prior records only as evidence of demonstrated knowledge, corrected misconceptions, or an explicitly changed mission. Do not infer mastery from the existence of a lesson file.

### 3. Gather trusted resources

Use two to five sources that directly support the lesson. Prefer:

1. official documentation or standards
2. primary technical specifications
3. authoritative research papers for scientific topics
4. well-maintained project documentation when no standard exists

Verify current or version-sensitive claims with available browsing tools. Do not invent links, cite unread resources, or use a secondary article when a clear primary source is available.

External hyperlinks are allowed in the lesson, but the lesson must not depend on the network to render.

### 4. Choose the next lesson path

Use this workspace:

```text
.skipperschool/
  GLOSSARY.md
  learning-records/
    NNNN-focus-slug.html
    NNNN-focus-slug.md
```

Choose the next four-digit number by scanning existing `.html` and `.md` learning records and adding one to the highest lesson number. Reserve that number for the lesson. If evidence justifies a learning record for the same lesson, use the same number and slug for its `.md` file.

Default lesson path:

```text
.skipperschool/learning-records/NNNN-focus-slug.html
```

Do not commit `.skipperschool/` unless the user explicitly asks.

### 5. Build the lesson

Before writing, read [references/lesson-standard.md](references/lesson-standard.md).

Use this section order:

1. Focus and outcome
2. Why it matters
3. Mental model
4. Recognize
5. Smallest safe fix or improvement
6. Verify
7. Apply nearby
8. Practice
9. Common mistakes
10. Reference card
11. Resources

Keep sections short and cumulative. Introduce only concepts required by the focus.

Include exactly this learning loop where appropriate:

```text
Recall: a prompt shown before its answer
Exercise: one small task
Check: the expected result and why
```

Use realistic examples, but keep them small enough that the central concept remains visible.

### 6. Make the HTML offline and accessible

The lesson must render without network access:

- inline CSS only
- inline SVG only for diagrams
- no external CSS, JavaScript, fonts, images, iframes, or CDNs
- no Mermaid runtime dependency
- no remote resources loaded by CSS

Use semantic headings, readable line lengths, responsive layout, keyboard-readable content, and high contrast. Use color to distinguish type, state, or function, but also use labels or shapes so meaning never depends on color alone.

Do not add decorative visuals. Add a flow, state, comparison, contract, map, or timeline diagram only when it clarifies the concept.

### 7. Apply Skipper guardrails

Teach this decision ladder:

```text
remove or simplify -> reuse project code -> native capability -> approved existing dependency -> minimum new code
```

Never teach simplification that removes a relevant guarantee, including:

- validation
- idempotency
- tests or verification
- security
- rollback or recovery
- observability
- data contracts
- units, CRS, dtype, nodata, coordinates, shape, or time zones
- retry and partial-failure safety

### 8. Update glossary and learning record carefully

Update `GLOSSARY.md` only for concepts actually taught. Use:

```text
concept - one-sentence definition - best verified resource URL
```

Create a learning record only when the conversation contains evidence of learning, such as:

- a misconception was corrected
- the user demonstrated understanding
- prior knowledge was established
- the learning mission changed

Do not create a learning record merely because a lesson was generated.

Use:

```markdown
# Title

Evidence: what showed learning
Changed: what changed
Use later: how this affects the next lesson
```

### 9. Validate

Run:

```text
python scripts/validate_lesson.py path/to/lesson.html
```

Also inspect the lesson visually when the environment supports it. Check code examples or commands when practical.

Never claim validation passed unless the command was run and its result was observed.

## Output discipline

- Lead with the lesson path or draft and its observable outcome. Do not narrate routine reasoning or tool use.
- Report focus, workspace changes, validation, and verified resources.
- Include visual, practice, glossary, learning-record, or commit details only when they were created, changed, or materially affect the result.
- Report validation with observed results, or `not run` with the reason.
- Do not claim that learning occurred without evidence. Omit empty categories, generic advice, and unrelated follow-on lessons.
- Before writing or returning the lesson, use the `humanizer` skill in embedded mode on its prose. Preserve verified facts, URLs, code blocks, commands, HTML structure, and accessibility requirements exactly; humanize only explanatory text.

## Completion criteria

Finish when:

- one focused outcome is taught
- the lesson follows the required sequence
- examples, visual, exercise, and check support the same concept
- the HTML is offline and accessible
- primary resources are verified and included
- validation was run or explicitly reported as not run
- glossary and learning-record changes follow their evidence rules
