# Stage 0 — Prototype / Draft PR

## Context

- Previous stage: none
- Current stage: working prototype and intended model behavior
- Next stage: Stage 1 — Structural Design

## Goal

Establish a working end-to-end prototype in a draft PR and make the intended model understandable enough to review its future structure.

## Review scope

Review whether:

- the model runs end-to-end;
- inputs, outputs, data flow, and expected behavior are described;
- experimental and intended production parts are distinguished;
- prototype code is kept in `/experiments` where applicable;
- a README or equivalent explains the model and working principle;
- the PR summary accurately describes scope and experimental exclusions;
- expected happy paths, edge cases, and failure scenarios are included in a test plan;
- another scientist has checked obvious scientific issues;
- the PR scope is reasonable and no obvious architectural anti-pattern prevents progression.

## Do not require yet

Do not block on repository formatting, linting, complete type hints, polished docstrings, final test implementation, or production-grade decomposition unless the prototype cannot be understood or executed.

## Blocking examples

- The model does not run and no reproducible explanation is provided.
- Inputs, outputs, or purpose cannot be determined.
- There is no documentation of intended design.
- Scientific validation has not been requested or recorded.
- The prototype is too broad or tangled to support a structural discussion.

## Exit criteria

Advance to Stage 1 when the prototype works, its intended behavior is documented, production versus experimental scope is clear, tests are planned, and the proposed solution can be discussed structurally.
