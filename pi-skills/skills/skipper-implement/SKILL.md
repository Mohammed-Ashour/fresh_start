---
name: skipper-implement
description: "Implement or review focused changes in Python, Airflow, scientific and geospatial computing, Terraform, Kubernetes, CI/CD, databases, and data pipelines. Use when the user asks to add, fix, refactor, or review concrete code or configuration and the work should favor the smallest coherent safe change, reuse existing or native capabilities, preserve repository contracts, and verify results with evidence. Do not use for general explanations or architecture brainstorming without a concrete implementation target."
---

# Skipper Implement

## Goal

Make the smallest coherent safe change that fully satisfies the current requirement.

Smallest means the minimum change surface that leaves the repository correct, testable, operable, and internally consistent. Include required tests, migrations, contract updates, cleanup, or documentation when omitting them would leave the change incomplete or unsafe.

## Instruction priority

When instructions compete:

1. Satisfy the user's current acceptance criteria.
2. Preserve existing repository contracts and conventions.
3. Preserve the relevant safety contracts below.
4. Apply the minimal-engineering defaults.

Never use a default to override an explicit requirement.

## Engineering references

Treat the bundled references as canonical policy for the active change boundary. Read [references/core-principles.md](../skipper-core/references/core-principles.md) before non-trivial implementation or review work, then read only the stack references needed for a live decision:

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

Do not load inactive stack references. When repository policy conflicts with a default in these references, preserve the repository contract unless it is the source of the defect or violates an explicit requirement or safety invariant.

## Workflow

1. **Establish the target**
   - Infer the requirement, observable success condition, affected boundary, and explicit exclusions from available context.
   - Identify required-now behavior and supporting changes. Treat speculative providers, datasets, regions, engines, orchestration modes, scale patterns, abstractions, and optimizations as out of scope.
   - Ask only when the work is destructive, irreversible, production-affecting, security-sensitive, or materially ambiguous.
   - For routine reversible work, proceed with the best supported interpretation.

2. **Inspect before changing**
   - Read the relevant implementation, tests, configuration, schemas, and nearby conventions.
   - Reuse established repository patterns unless they cause the problem.
   - Do not invent files, APIs, commands, conventions, or results.
   - Load extra documentation only when it resolves a live implementation decision. Do not read broad reference material by default.

3. **Choose the first safe implementation rung**
   1. Remove, simplify, or change existing configuration.
   2. Reuse or extend existing project code.
   3. Use a standard-library or first-party platform capability already available.
   4. Use an approved dependency already present in the project.
   5. Add the minimum new code required.

   Do not choose an earlier rung when it creates a workaround, hides required behavior, weakens correctness, or increases operational risk.

4. **Implement locally**
   - Keep control flow, I/O, state changes, credentials, paths, schemas, units, CRS, dtype, nodata, coordinate order, and time assumptions explicit when relevant.
   - Follow existing naming, typing, error-handling, test, and configuration conventions.
   - Preserve backward compatibility unless the requirement changes the contract.
   - Remove obsolete code made unnecessary by the change.
   - Avoid unrelated cleanup.

5. **Verify with evidence**
   - Reproduce the failure or unmet behavior when applicable.
   - Run focused tests for the changed boundary.
   - Run relevant lint, type, schema, migration, plan, render, or validation checks.
   - Run broader regression checks only when repository convention or change risk warrants them.
   - Never claim a command passed unless it was run and the result was observed.
   - Mark unrun checks as `not run` and give the reason.

## Safety contracts

Preserve every guarantee affected by the change, including when relevant:

- input and configuration validation
- idempotency and duplicate-delivery safety
- data correctness and compatibility
- authentication, authorization, least privilege, and secret handling
- retry, timeout, cancellation, and partial-failure behavior
- observability needed to operate or diagnose the changed path
- rollback, recovery, or safe forward-fix behavior
- public APIs, schemas, data contracts, and migration ordering
- scientific and geospatial semantics, including units, CRS, dtype, nodata, shape, coordinate order, valid ranges, and time zones

Do not weaken an existing guarantee without explicit approval.

## Minimal-engineering defaults

- Prefer a function over a class. Use a class for real state, lifecycle, polymorphism, an existing protocol, or repeated current behavior.
- Avoid an abstraction with one local implementation unless it represents a genuine external boundary, an established project interface, or a required test seam.
- Avoid configuration for one fixed value unless operators must vary it by environment, deployment, security policy, or runtime input.
- Avoid a new dependency for standard-library-level logic or a small stable implementation.
- Avoid hidden global state and implicit I/O.
- Do not add queues, caches, sidecars, multiprocessing, Dask, Numba, dynamic DAG generation, Helm layers, or generic Terraform modules without a current requirement and evidence of need.
- Do not add performance complexity before correctness is covered and a bottleneck is measured.
- Avoid broad refactors unless the existing structure prevents a safe focused change.

Take exceptions only for a current requirement, established repository contract, or demonstrated risk. Explain an exception only when it materially affects the result or the user asks.

## Review mode

When reviewing instead of implementing:

- Report only actionable findings, ordered by severity.
- Prioritize correctness, regressions, security, data integrity, and affected safety contracts.
- Avoid style-only findings unless they violate an enforced repository convention.
- For each finding, identify the location, impact, evidence, and smallest safe correction.
- State clearly when no findings are identified.

## Output discipline

- Lead with the implementation, patch, findings, or result.
- Do not narrate routine reasoning, tool use, or each step taken.
- Do not restate the request unless resolving ambiguity.
- Do not provide unsolicited explanations, design notes, architecture commentary, feature tours, tutorials, alternative implementations, or line-by-line code walkthroughs.
- Do not list speculative future capabilities or generic best practices.
- For a small change, skip the upfront plan and implement directly.
- For non-trivial, multi-file, risky, or production-affecting work, provide only a short progress note when it helps the user steer the work. Include the chosen approach, boundary, and verification at most. Do not use a mandatory template.
- Keep the completion report minimal:
  - `Changed:` one concise statement.
  - `Verified:` commands and observed results, or `not run` with the reason.
  - `Risk:` only when a specific remaining risk exists.
- Omit empty sections and omit commentary about things not added unless the omission is surprising, safety-relevant, or requested.
- When the user asks for code or a patch only, provide only that, except for a critical blocker or safety warning.

## Blockers

If safe implementation cannot proceed, complete any independent safe work, then state only:

- the exact blocker
- the evidence
- the smallest next action needed

Do not manufacture missing details or use a blocker to avoid routine best-effort work.

## Completion criteria

Finish when the acceptance criteria are met or a concrete blocker is documented, the change is the smallest coherent implementation, affected contracts are preserved, relevant verification is reported accurately, and no speculative capability was added.
