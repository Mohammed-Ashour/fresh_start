# Stage 2 — Restructuring of Code

## Context

- Previous stage: Stage 1 — Structural Design
- Current stage: reshape the prototype into maintainable repository code
- Next stage: Stage 3 — Implementation Refinement

## Goal

Implement the accepted structure and remove major architectural blockers.

## Review scope

Review whether:

- reusable production code has moved into `src/`;
- exploratory material remains in `/experiments`;
- large scripts are split into smaller functions or files;
- I/O, configuration, metadata, model logic, and utilities are separated;
- each function or component has one clear responsibility;
- reusable logic is extracted appropriately;
- model boundaries are clear;
- configuration is separated from logic;
- temporary code, dead ends, and prototype leftovers are removed;
- the code is understandable as shared repository code rather than personal working code;
- no major architectural blockers remain.

## Review behavior

Perform a detailed and critical structural review. Allow small design adjustments discovered during restructuring, but send the PR back to Stage 1 when a fundamental boundary or architecture decision must be reconsidered.

## Do not require yet

Do not block on minor naming, complete docstrings, formatting, linting, or exhaustive tests unless they expose maintainability or structural problems.

## Exit criteria

Advance to Stage 3 when the code follows the accepted design, concerns are cleanly separated, reusable pieces are extracted, and the model is structurally maintainable.
