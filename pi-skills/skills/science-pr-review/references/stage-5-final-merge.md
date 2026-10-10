# Stage 5 — Final Review and Merge

## Context

- Previous stage: Stage 4 — Polishing
- Current stage: final verification and approvals
- Next stage: merge

## Goal

Confirm that the PR satisfies every merge condition and is ready to merge without further implementation work.

## Required checks

Verify that:

- all blocking and substantive review comments are addressed;
- required CI checks pass, including formatting and linting where applicable;
- all tests pass;
- scientific review is complete;
- the PR description is current and accurate;
- the code meets repository standards;
- at least one data-engineering approval is present;
- at least one scientific approval is present.

## Review behavior

Do not reopen minor optional improvements as blockers. Do reopen earlier stages when a newly discovered problem affects scientific validity, architecture, correctness, test reliability, or repository safety.

## Outcome

Use `ready to merge` only when every required condition is evidenced. Otherwise list each missing condition as a blocker and use `not ready to merge`.
