# Skipper core principles

Use this policy as the common engineering baseline for implementation, review, audit, and teaching.

## Instruction priority

1. Satisfy the current requirement and acceptance criteria.
2. Preserve repository contracts and established conventions.
3. Preserve relevant safety guarantees.
4. Apply YAGNI, KISS, and the smallest coherent safe change.

A smaller diff is not better when it leaves the system inconsistent, untestable, unsafe, or harder to operate.

## Decision ladder

Evaluate these options in order and choose the first one that completely and safely meets the current requirement:

1. Remove or simplify existing code, configuration, or behavior.
2. Reuse project code, resources, workflows, and conventions.
3. Use a native capability already available in the current stack.
4. Use an approved existing dependency.
5. Add the minimum new code or configuration.

A native capability is a standard-library, database, orchestration, cloud, infrastructure, or first-party platform feature already available in the current stack.

Do not choose an earlier rung when it only moves complexity, hides required behavior, weakens correctness, or increases operational risk.

## Mandatory guarantees

Preserve guarantees relevant to the affected boundary:

- validation and explicit configuration
- idempotency and duplicate-delivery safety
- data correctness and compatibility
- authentication, authorization, least privilege, and secret handling
- retry, timeout, cancellation, and partial-failure behavior
- observability needed to diagnose and operate the path
- rollback, recovery, replay, or safe forward-fix behavior
- public APIs, schemas, contracts, and migration ordering
- scientific and geospatial semantics

Do not weaken an existing guarantee without explicit approval and concrete evidence.

## Evidence rules

- Inspect relevant implementation, callers, tests, configuration, schemas, and deployment context before concluding.
- Distinguish observed facts from inferences.
- Do not invent files, commands, conventions, test results, runtime behavior, or production evidence.
- Report unrun checks as `not run` with a reason.
- Prefer the smallest test or verification that protects the behavior, not tests for their own sake.
- Avoid unrelated cleanup, speculative extensibility, and broad rewrites.
