# Review Lifecycle

## Purpose

Move science code from experimentation to production-quality repository code while preserving fast iteration and making expectations clear to authors and reviewers.

## Roles

### Scientist / PR author

Drive the PR through the stages, request review and alignment, document the model, implement changes, and obtain scientific validation from another scientist.

### Data engineer / technical reviewer

Guide structure, maintainability, interfaces, tests, repository conventions, and engineering quality. Do not claim scientific correctness.

## Stage map

| Stage | Primary question | Exit signal |
|---|---|---|
| 0 — Prototype | Does the model work and is its intended behavior understandable? | Working draft with documented intent and test plan |
| 1 — Structural Design | Is the target structure appropriate before detailed implementation work? | Structure accepted; restructuring plan is clear |
| 2 — Restructuring | Has prototype code become maintainable repository code? | Model is structurally sound with no major architectural blockers |
| 3 — Implementation Refinement | Is the implementation explicit, clean, testable, and sufficiently tested? | Stable code, clear interfaces and data flow, core tests present |
| 4 — Polishing | Have automated and detailed quality checks been completed? | Formatting, linting, documentation details, automated review, and CI are clean |
| 5 — Final Review and Merge | Are all technical and scientific merge conditions satisfied? | Required approvals and checks are complete |

## Stage inference

Infer the earliest stage whose exit criteria are not yet met.

- Working but exploratory code with unclear boundaries: Stage 0.
- Intended components and interfaces are under discussion: Stage 1.
- Agreed structure exists but code is still being reorganized: Stage 2.
- Structure is stable and implementation/tests are being improved: Stage 3.
- Code is stable and only detailed or automated issues remain: Stage 4.
- All implementation work is complete and only final approvals/checks remain: Stage 5.

When evidence is incomplete, state the assumed stage and list the missing evidence needed to confirm it.

## Cross-stage rules

- Review the current maturity gate, not the ideal final state.
- Do not allow unresolved blockers from an earlier stage to be hidden by later-stage polish.
- A PR may move backward if implementation reveals a structural flaw.
- Scientific review is owned by the science team; technical review may only verify that scientific validation occurred.
- Experimental code belongs in `/experiments`; reusable production code belongs in `src/`.
