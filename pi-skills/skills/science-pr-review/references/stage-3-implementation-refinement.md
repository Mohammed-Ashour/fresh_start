# Stage 3 — Implementation Refinement

## Context

- Previous stage: Stage 2 — Restructuring of Code
- Current stage: implementation quality, explicit interfaces, data flow, and tests
- Next stage: Stage 4 — Polishing

## Goal

Make the stable structure clean, explicit, independently testable, and well tested.

## Review scope

Review whether:

- function signatures and interfaces are clean and minimal;
- inputs, outputs, and dependencies are explicit;
- hidden state, implicit mutation, and hidden processing steps are avoided;
- functions can be called and tested independently;
- dependencies can be mocked where appropriate;
- classes or data representation objects are used where they improve clarity;
- data flow is understandable without guessing;
- core behavior, key edge cases, and failure scenarios are tested;
- tests validate behavior rather than incidental implementation;
- test structure is maintainable;
- error handling and configuration are appropriate;
- naming, readability, type hints, and important documentation are sufficient;
- dead or commented-out code is removed.

## Review behavior

Expect multiple iterations. If major structural changes are still needed, classify them as a regression to Stage 2 rather than treating them as ordinary refinement findings.

## Exit criteria

Advance to Stage 4 when structure and code are stable, interfaces and data flow are explicit, core logic is covered by tests, and no major implementation changes remain.
