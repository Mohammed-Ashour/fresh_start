# Offline lesson standard

## Required section identifiers

Use these exact section IDs so validation and navigation remain stable:

1. `focus-outcome`
2. `why-it-matters`
3. `mental-model`
4. `recognize`
5. `smallest-safe-fix`
6. `verify`
7. `apply-nearby`
8. `practice`
9. `common-mistakes`
10. `reference-card`
11. `resources`

Each section needs a visible heading.

## Page structure

Use semantic HTML:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>...</title>
  <style>...</style>
</head>
<body>
  <header>...</header>
  <main>
    <section id="focus-outcome">...</section>
    ...
  </main>
</body>
</html>
```

A small table of contents is useful when it links to the required section IDs.

## Content standard

### Focus and outcome

State the topic, the assumed level, and one observable outcome.

### Why it matters

Use one concrete failure mode, cost, or operational consequence. Avoid inflated claims.

### Mental model

Give one compact model that can be reused during implementation or review.

### Recognize

Show signals in code, configuration, data, or runtime behavior that reveal the issue.

### Smallest safe fix

Apply the Skipper ladder and explain why earlier rungs do or do not work. Preserve relevant guarantees.

### Verify

Provide a command, assertion, invariant, or inspection that distinguishes correct from incorrect behavior.

### Apply nearby

Show one closely related place where the same model transfers. Do not start a second lesson.

### Practice

Include at least one Recall, one Exercise, and one Check. Place the answer after the learner has a chance to think.

### Common mistakes

List only mistakes directly related to the focus.

### Reference card

Create a compact decision rule, checklist, or comparison suitable for later scanning.

### Resources

List two to five verified primary sources. Include title, organization or author, and URL.

## Visual standard

Use at most two purposeful inline SVG diagrams for a normal lesson.

Recommended visual forms:

- flow for retries, commits, and manifests
- state diagram for lifecycle or failure transitions
- comparison for wrapper versus useful boundary
- contract diagram for producer, dataset, and consumer
- map or grid for CRS and alignment
- timeline for backfill, migration, or release ordering

Requirements:

- include a visible title or caption
- use high-contrast text and shapes
- use consistent colors by type, state, or function
- include text labels or symbols in addition to color
- provide a short textual explanation after the SVG
- avoid animation and decoration

## Code and command examples

- Keep examples minimal but executable or internally consistent.
- Mark omitted context explicitly.
- Show the unsafe or confusing form only when comparison helps.
- Explain the verification signal, not just the command.
- Do not include credentials, proprietary paths, or invented production values.

## Offline requirements

Allowed:

- inline `<style>`
- inline `<svg>`
- external resource links in ordinary `<a href>` elements

Disallowed:

- `<link>` stylesheets
- `<script src>` or remote JavaScript
- external images, fonts, video, audio, iframes, objects, or embeds
- `srcset`; use one inline `data:` source instead
- CSS `url()` references to remote resources
- Mermaid blocks that require a runtime renderer

## Accessibility and readability

- Use one `h1`, then hierarchical headings.
- Keep body text at a readable size and line length.
- Do not encode meaning by color alone.
- Give tables headers and captions when useful.
- Use `<code>` and `<pre>` appropriately.
- Make focus indicators visible for links.
- Include print rules that preserve content and avoid clipped diagrams when practical.
