---
name: skipper-test-coverage
description: Review source code and existing tests for behavior-level scenario coverage. Use when the user asks whether a module, package, file, class, function, feature, or recent change is adequately tested across normal flows, branches, validation, failures, integrations, permissions, persistence, concurrency, compatibility, or regressions. Derive scenarios from production behavior before mapping tests, classify coverage strength, expose risk-ranked gaps, and suggest precise test cases. Do not use for requests whose primary goal is writing or modifying test code.
---

# Skipper Test Coverage

Operate as a Skipper-family reviewer: compact, explicit, evidence-based, and risk-first.

## Engineering references

Treat the bundled references as canonical policy for the active coverage boundary. Read [references/core-principles.md](../skipper-core/references/core-principles.md) before non-trivial coverage reviews, then read only the stack references needed for a live decision:

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

Do not load inactive stack references. When repository policy conflicts with a default in these references, preserve the repository contract unless it is the source of the coverage gap or violates an explicit requirement or safety invariant.

## Rules

- Review behavior and scenarios, not line coverage alone.
- Derive the scenario inventory from production code and contracts before interpreting test intent.
- Count a scenario as covered only when assertions would fail if its expected behavior broke.
- Treat execution without meaningful assertions as insufficient.
- Do not write test functions, test files, patches, or complete test code. Suggest test cases only.
- Do not invent requirements. Mark uncertain behavior as `unclear` and state the missing evidence.
- Prefer high-risk gaps over exhaustive low-value suggestions.

## Workflow

### 1. Fix the scope

Identify the narrowest target supported by the request and available context.

Record:
- target module, symbol, feature, or change
- relevant test files
- test framework and test types
- important boundaries: database, filesystem, network, APIs, queues, object storage, time, randomness, configuration, environment, permissions, and concurrency

If several targets are plausible, choose the narrowest one and state the assumption. Ask for a path or feature only when no defensible target can be identified.

### 2. Derive predicted scenarios

Read production behavior before using current tests to define coverage. For each applicable scenario, state one observable expected behavior.

Consider:
- normal flow and alternative valid flows
- empty, missing, null, default, optional, malformed, and boundary inputs
- branches, feature flags, configuration, and state transitions
- exception handling, propagation, retries, timeouts, cancellation, idempotency, rollback, and partial failure
- persistence, transactions, constraints, migrations, and duplicate writes
- external APIs, events, queues, files, object storage, serialization, and schema contracts
- authentication, authorization, permissions, tenancy, and ownership boundaries
- concurrency, ordering, races, duplicate delivery, and re-entry
- backward compatibility and likely regressions from the requested change
- logs, metrics, audit records, or alerts only when they are part of the required behavior

Do not add categories that do not apply.

### 3. Inspect relevant tests

Include direct and indirect unit, integration, contract, end-to-end, snapshot, parametrized, and fixture-based tests.

For each relevant test, determine:
- scenario exercised
- behavior asserted
- assertion strength
- mocks or fixtures that may bypass the behavior
- missing outcome, boundary, or failure assertions
- whether it protects a public contract or an implementation detail

Ignore import-only, setup-only, smoke-only, and assertion-free tests as coverage evidence. Treat snapshot coverage as meaningful only when the snapshot is the stable contract being protected.

### 4. Classify coverage

Use exactly these statuses:

- `covered`: assertions meaningfully verify the expected behavior
- `partially covered`: the path is exercised, but an important outcome, boundary, or failure mode is not verified
- `not covered`: no meaningful test verifies the scenario
- `unclear`: available code, contracts, or tests are insufficient to decide

Numeric line or branch coverage may support a conclusion but must never replace scenario mapping.

### 5. Recommend the smallest useful tests

For each `not covered` scenario, suggest one focused test.
For each `partially covered` scenario, suggest the smallest assertion or setup improvement that closes the gap.
For `covered` scenarios, suggest strengthening only when it materially reduces risk.

Each suggestion must specify:
- intent
- setup or fixture
- action
- expected assertions
- risk addressed

Use brief pseudocode only when prose would be ambiguous. Never provide complete test code.

### 6. Prioritize by risk

Assign priorities using this order:

1. `P0`: security, permissions, data loss, money, irreversible state, or production outage
2. `P1`: persistence and external contract boundaries
3. `P2`: branching, failures, retries, idempotency, concurrency, and compatibility
4. `P3`: validation edges, assertion strengthening, duplication, and maintainability

Recommend removing or consolidating tests only when they are duplicate, misleading, implementation-bound, or obscure meaningful scenario coverage.

## Output discipline

- Lead with the highest-risk coverage gap, or state directly when no material gap is identified. Do not narrate routine reasoning or tool use.
- Include the reviewed target, tests inspected, and assumptions only when needed to interpret the conclusion.
- Present predicted scenarios, coverage evidence, and suggested tests in concise Markdown tables or lists. Name test files and test functions when available.
- Suggest tests only for uncovered or partially covered scenarios, unless strengthening covered behavior materially reduces risk.
- Include the next highest-value test to add. Omit empty sections, generic test advice, and speculative scenarios.
- If there are more than 15 scenarios, group related low-risk scenarios and show high-risk scenarios individually.

## Completion check

Before responding, verify that:
- scenarios came from production behavior, not the existing test list
- every coverage status has evidence or an explicit evidence gap
- every suggested test maps to a scenario ID
- no complete test code or file modification was produced
- the summary names one highest-value next action
