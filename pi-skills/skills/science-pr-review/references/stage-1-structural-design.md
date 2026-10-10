# Stage 1 — Structural Design

## Context

- Previous stage: Stage 0 — Prototype / Draft PR
- Current stage: target model structure and component boundaries
- Next stage: Stage 2 — Restructuring of Code

## Goal

Agree on the target model structure before performing detailed implementation review.

## Review scope

Review whether:

- the main model steps are identified;
- responsibilities are separated clearly;
- independent components are identified;
- each component has defined inputs and outputs;
- data flow is understandable at a high level;
- reusable logic has an appropriate home;
- production and experimental code are separated in the design;
- the proposed structure follows repository conventions and standardized model patterns;
- components, functions, objects, or scripts are not overly large, vague, or misplaced;
- a README, diagram, or flowchart communicates the design.

## Review behavior

Focus on design, not line-by-line implementation. When the structure is materially wrong, provide only high-level blocking feedback and avoid spending time on detailed code comments that will become obsolete.

## Outcomes

Use one of these outcomes:

- `structure accepted — ready to advance to Stage 2`;
- `restructure required before detailed review`.

## Do not require yet

Do not block on full implementation quality, complete unit tests, formatting, linting, or detailed docstrings unless they are necessary to understand the design.

## Exit criteria

Advance to Stage 2 when component boundaries, responsibilities, interfaces, and repository placement are accepted and the author has a clear restructuring plan.
