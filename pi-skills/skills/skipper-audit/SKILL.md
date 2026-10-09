---
name: skipper-audit
description: "audit a repository or defined subsystem for concrete maintainability and production risk across python, airflow, scientific and geospatial computing, terraform, kubernetes, ci/cd, databases, observability, tests, and data contracts. use when the user wants a broad evidence-based health assessment rather than a single pull-request review. inventory the actual stack, inspect high-risk execution and deployment paths, report prioritized findings tied to files or repeated patterns, and recommend the smallest coherent sequence of deletion, reuse, native capabilities, or local fixes. do not implement remediation, propose rewrites, or claim uninspected areas are healthy."
---

# Skipper Audit

## Goal

Audit the requested repository or subsystem for the smallest changes that remove unnecessary complexity or materially reduce production risk.

Report concrete findings tied to inspected files, commands, or repeated patterns. Do not turn the audit into a generic best-practices checklist, platform migration proposal, or rewrite plan.

## Instruction priority

Use this order when instructions compete:

1. Respect the requested audit scope and release context.
2. Prioritize correctness, security, recovery, and operability.
3. Use repository evidence and observed commands.
4. Recommend the smallest coherent remediation sequence.
5. Apply YAGNI and KISS to cleanup and future design.

## Engineering references

Treat the bundled references as canonical policy for the active audit boundary. Read [references/core-principles.md](references/core-principles.md) before non-trivial audit work, then read only the stack references needed for a live decision:

- [references/python.md](references/python.md)
- [references/airflow.md](references/airflow.md)
- [references/scientific-geospatial.md](references/scientific-geospatial.md)
- [references/terraform.md](references/terraform.md)
- [references/kubernetes.md](references/kubernetes.md)
- [references/ci-cd.md](references/ci-cd.md)
- [references/databases-migrations.md](references/databases-migrations.md)
- [references/data-pipelines-contracts.md](references/data-pipelines-contracts.md)
- [references/observability-recovery.md](references/observability-recovery.md)
- [references/security.md](references/security.md)

Do not load inactive stack references. When repository policy conflicts with a default in these references, preserve the repository contract unless it is the source of the risk or violates an explicit requirement or safety invariant.

## Workflow

### 1. Define scope and coverage

Identify:

- repository, subsystem, or release boundary
- relevant environments and deployment paths
- high-value data or infrastructure at risk
- requested depth or time constraint
- excluded or inaccessible areas

For a repository-wide audit, inventory the tree before selecting files. Do not assume standard directories exist. Record what was inspected, sampled, excluded, and not assessed.

### 2. Build a risk map

Locate the actual entry points and change-producing paths, such as:

- application, CLI, worker, DAG, or job entry points
- database and object-storage writes
- schema and contract definitions
- migrations and backfills
- deployment and infrastructure definitions
- release workflows and artifact creation
- retries, queues, schedules, and concurrency controls
- logs, metrics, alerts, and operator procedures
- tests and fixtures that protect these paths

Use README files and architecture docs as guides, then verify material claims against code and configuration.

### 3. Inspect highest-risk paths first

Prioritize boundaries where failure can corrupt data, duplicate outputs, expose credentials, destroy infrastructure, block recovery, or create silent production failure.

Inspect enough related code and configuration to establish behavior. For repeated patterns, cite representative locations and state the observed sample size or search method.

Apply the relevant engineering references to each active stack.

### 4. Apply the remediation ladder

For each finding, evaluate the smallest safe response in this order:

1. **Delete or simplify** unnecessary code, layers, configuration, or duplication.
2. **Reuse project behavior** already present elsewhere.
3. **Use native capabilities** of the current language, platform, database, or service.
4. **Use an approved existing dependency** already in the repository.
5. **Add minimum new code** only when earlier options do not satisfy the requirement.

Do not recommend an earlier rung when it merely moves complexity, hides required behavior, or weakens safety.

### 5. Verify and consolidate

Run the narrowest useful non-destructive checks when practical, such as tests, linting, type checking, DAG imports, schema validation, dependency inspection, Terraform validation or plans, and manifest rendering.

Consolidate duplicate symptoms into the underlying issue. Separate systemic patterns from isolated cleanup.

### 6. Prioritize remediation

Order findings by:

1. impact and blast radius
2. likelihood or frequency
3. detectability before harm
4. recoverability
5. remediation cost and dependency order

A small cleanup with no production impact must not outrank a credible correctness or recovery failure.

## Ratings

Rate each inspected area with one status:

- **healthy**: no material issue found in the inspected evidence
- **cleanup-recommended**: removable complexity or maintainability drag with low immediate production risk
- **production-risk**: credible reliability, correctness, security, operability, or recovery weakness
- **urgent-risk**: active or release-critical risk of data loss, corruption, secret exposure, outage, unrecoverable infrastructure mutation, or silent failure
- **not-assessed**: insufficient access or coverage to make a claim

Use one overall decision:

- **healthy**: no material finding in the inspected scope
- **simplify**: only low-risk simplification findings
- **needs cleanup**: material maintainability drag, but no demonstrated high production risk
- **high risk**: one or more production-risk findings require planned remediation
- **block release**: an urgent risk directly affects the current release or deployment boundary

Do not derive confidence from repository size, test count, or polished documentation alone.

## Evidence rules

Every finding must include:

- concrete file locations or a reproducible search result
- observed evidence
- affected behavior or operational boundary
- severity and confidence
- the smallest coherent fix
- a way to verify remediation

Also follow these rules:

- Distinguish confirmed findings from likely findings that require runtime or environment evidence.
- Do not claim an area is healthy if it was not inspected.
- Do not report generic missing files or tools unless the repository's current behavior requires them.
- Do not recommend a new platform, framework, operator, queue, cache, or abstraction before checking deletion, reuse, native features, and current dependencies.
- Do not implement fixes unless the user explicitly requests remediation.
- Do not produce dozens of low-value findings. Prefer the few root causes with the greatest impact.

## Output discipline

- Lead with the overall outcome and prioritized findings. Do not narrate routine reasoning or tool use.
- Include scope, inspected coverage, and material exclusions only when they affect the conclusion.
- For each finding, provide its severity, confidence, locations, observed evidence, impact, smallest safe fix, and verification.
- Consolidate lower-risk simplification candidates and remediation sequencing when they are useful.
- Report verification with observed results, or `not run` with the reason. State residual uncertainty only when it materially limits the audit.
- Omit empty sections, generic best practices, speculative future capabilities, and praise.

When no material finding is found, say `no material findings in the inspected scope`; do not imply the entire repository is risk-free.

## Completion criteria

Finish when:

- the inspected and uninspected scope is explicit
- high-risk execution, write, deployment, and recovery paths were prioritized
- every finding is concrete, evidenced, and deduplicated
- ratings reflect impact and confidence
- remediation follows the smallest-safe-change ladder
- verification and residual uncertainty are reported honestly
