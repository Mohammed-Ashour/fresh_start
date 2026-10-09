# Stage 4 — Polishing

## Context

- Previous stage: Stage 3 — Implementation Refinement
- Current stage: detailed and automated quality checks
- Next stage: Stage 5 — Final Review and Merge

## Goal

Resolve detailed quality issues using automated tools and final documentation cleanup.

## Review scope

Verify that the author has:

- run the formatter;
- run the linter;
- addressed relevant editor or static-analysis warnings;
- addressed automated review comments from tools such as Copilot or Codex;
- completed and checked docstrings;
- made type hints consistent;
- removed unused code;
- ensured applicable CI checks pass;
- obtained or requested a final scientific-content review while the code is stable.

## Review behavior

Detailed comments are appropriate here. Keep data-engineering architectural input minimal unless polishing reveals a substantive issue from an earlier stage. Reclassify such issues to the correct earlier stage.

## Exit criteria

Advance to Stage 5 when automated and detailed checks are clean, remaining comments are resolved, scientific review is complete or ready for final confirmation, and the PR can be marked ready rather than draft.
