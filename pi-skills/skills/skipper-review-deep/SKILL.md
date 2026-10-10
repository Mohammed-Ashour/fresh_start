---
name: skipper-review-deep
description: "run a thorough review of a pull request, diff, branch, commit, or uncommitted change when the user explicitly asks for a deep review. For science-model PRs, apply the requested or inferred Stage 0-5 maturity gate. Build on skipper-review, inspect every changed line, trace affected callers and consumers, and check behavior, state, failure modes, concurrency, compatibility, security, privacy, performance, design, dependencies, release safety, operations, documentation, user experience, and tests. Report every actionable change-related issue with exact issue code and minimal fix code. Do not use for routine reviews, repository-wide audits, or requests to implement fixes."
---

# Skipper deep review

## Goal

Find change-related problems that a focused review could miss. Follow the changed behavior through the parts of the system that depend on it, then check each possible finding against the code before reporting it.

A deep review spends more time gathering context and checking the same change from different angles. It is not permission to report guesses, unrelated debt, style preferences, or broad redesign ideas. Review only; do not edit files unless the user asks for fixes.

## Start with the base skill

Read [../skipper-review/SKILL.md](../skipper-review/SKILL.md). Follow its priorities, stack references, severity levels, evidence rules, and implementation ladder.

Also read [references/deep-review-rubric.md](references/deep-review-rubric.md) for every non-trivial deep review. Load only the stack references that match the change.

This skill sets the amount of context to inspect and the evidence to retain. Use the base skill's plain-language, visual finding style; deeper inspection does not require a denser report. The user's request and repository policy still come first.

When the base skill activates science review mode, retain its selected stage,
scope, deferral rules, persisted report, and readiness outcome. Deep review adds
line-by-line inspection and broader tracing; it does not impose later-stage
requirements on an earlier-stage science PR.

## What makes the review deep

A deep review must:

- inspect every human-written changed line
- read each changed file in full unless it is generated or contains only data
- trace changed entry points through the callers, consumers, schemas, configuration, persistence, deployment, and tests needed to judge them
- check normal behavior, boundaries, failures, and lifecycle transitions
- continue after the first defect and collect every distinct actionable issue
- try to disprove each candidate finding before reporting it
- tie findings to behavior introduced, worsened, relied on, or newly exposed by the change

List generated, vendored, binary, data-only, inaccessible, or excluded files that you did not inspect line by line.

## Workflow

### 1. Pin down the change

Identify:

- base and head revisions
- the requirement, acceptance criteria, and intended user behavior
- changed files and line count
- runtime, data, API, infrastructure, release, and trust boundaries
- repository instructions that apply to each changed path
- checks already present
- exclusions and evidence you cannot access

A large change may need more than one review session. Still inspect the requested scope, state any coverage limit, and suggest review slices that can stand on their own. Size alone is not a defect.

### 2. Map what the change touches

For each changed entry point, find the relevant:

- callers and downstream consumers
- APIs, commands, events, files, schemas, and database contracts
- state, caches, queues, persistence, and external systems
- configuration, flags, secrets, permissions, and environment assumptions
- deployment order, mixed-version behavior, rollback, replay, and recovery
- tests, fixtures, documentation, logs, metrics, and alerts

Use search and history when they clarify intent or compatibility. Names alone do not establish a contract.

### 3. Read every changed line in context

Read the full enclosing function, class, resource, or document. Work out what each changed line does and how it affects nearby invariants.

For generated or repetitive files, confirm the source of truth before scanning them. Record what you skipped and why.

### 4. Make separate review passes

Check the change once for each applicable concern:

1. **Requirement and correctness**: intended behavior, validation, boundaries, errors, and user outcomes.
2. **Data and state**: invariants, ordering, transactions, idempotency, duplicate work, missing work, partial writes, and cleanup.
3. **Failures and concurrency**: retries, timeouts, cancellation, races, deadlocks, reentrancy, resource ownership, and dependency failure.
4. **Contracts and compatibility**: APIs, schemas, CLI behavior, configuration, serialization, migrations, mixed versions, and deprecation.
5. **Security and privacy**: authentication, authorization, injection, secrets, sensitive data, permissions, unsafe parsing, and dependency trust.
6. **Performance and capacity**: algorithmic cost, memory, I/O, queries, network calls, batching, limits, backpressure, and production scale.
7. **Design and module depth**: ownership, coupling, dependency direction, abstraction leaks, global state, duplicated policy, and unnecessary concepts.
8. **Operations and release safety**: diagnosis, rollout, rollback, replay, restore, destructive changes, and operator actions.
9. **Tests**: whether assertions detect the relevant defect, missing risk scenarios, isolation, and integration realism.
10. **Human-facing behavior**: errors, documentation, accessibility, discoverability, safe defaults, and recovery from mistakes.

Use the questions in the deep-review rubric. Skip concerns that do not apply; do not add empty pass reports to the final output.

If the environment supports independent review agents, assign separate concerns to them. Give each agent the same base, head, requirement, and repository instructions. The primary reviewer must verify and deduplicate their candidates before reporting them.

### 5. Trace risky paths from start to finish

For each high-risk path, consider:

- valid, empty, boundary, malformed, and hostile input
- first run, repeated run, retry, resume, and concurrent execution
- success, dependency failure, timeout, cancellation, and process interruption
- old producers with new consumers and new producers with old consumers when versions can overlap
- rollback or replay after partial side effects
- realistic production volume rather than test fixture size

Run a focused, non-destructive check when reading the code cannot settle the question.

### 6. Challenge each candidate

Keep a private list of possible findings. For each one, record the changed location, trigger, issue code, affected caller or contract, facts and assumptions, impact, severity, fix code, and a verification method.

Before reporting it, ask:

- Is this behavior intentional?
- Did it exist before the change without becoming more reachable or harmful?
- Is the caller or failure path actually reachable?
- Does validation, cleanup, locking, compatibility code, or another guard prevent it?
- Would the author act on it?
- Can a local fix solve it?

Drop guesses, duplicate symptoms, and preferences.

### 7. Verify what you can

Run the smallest useful checks. A deep review does not have to run the full test suite, but it must state what ran and what did not.

Only claim a command passed when you ran it and saw the result. If a command fails, separate failures caused by the change from failures caused by the environment or existing code.

### 8. Report every supported finding

Sort findings by severity and impact. Use one finding per root cause. Add other locations only when they show the scope of that cause.

Retain the following for every finding, but do not turn them into a long field-by-field list in the report:

- a review-local ID such as `SK-DR-001`, level, plain-language title, precise location, and confidence
- a concrete trigger scenario and any assumptions it needs
- inspected evidence establishing the behavior and affected caller, consumer, invariant, or contract
- the observable impact, distinguishing demonstrated behavior from conditional outcomes
- the smallest exact issue excerpt and smallest safe fix code
- a focused verification method

Present the scenario and a small visual first, then **The problem**, **Impact**, and **What's needed**, as described in the base skill. Put supporting code and evidence after the explanation. A compact issue/fix diff can serve as both the visual and the code evidence for a simple defect.

Copy issue code from the inspected file or patch. For deleted or missing behavior, quote the relevant diff or nearest changed call site and state what is absent. Fix code must use interfaces found in the repository and keep the original indentation. When an exact edit depends on missing context, label it as pseudocode and list what must be confirmed. Never invent an API.

## Output

Put findings first. Use the base skill's example and its local `show-me` and `unslop` instructions instead of a separate deep-review finding template. Explain every supported issue; do not hide lower-severity findings or uncertainty to make the report shorter.

Keep `Findings`, `Decision`, `Inspected scope`, and `Verification`, even when brief:

- `Findings`: plain-language scenarios, small visuals, impact, correction, and supporting evidence.
- `Decision`: overall level and the concrete reason.
- `Inspected scope`: base/head revisions, relevant context, and exclusions.
- `Verification`: observed check results, plus unrun checks and their reasons.

Retain `Stage assessment` when science review mode applies. Add `Residual risk` only for uncertainty that limits the review. Omit other empty sections.

If there are no findings, write `No actionable findings.` and still report scope, exclusions, checks, and material residual risk. No diagram is needed.

Apply `unslop` to the prose before returning the report. Preserve findings, severity, confidence, evidence, paths, line numbers, commands, diagrams, exact code excerpts, and required sections. Simpler wording must not turn a conditional issue into a confirmed one.

## Keep noise out

- A missing checklist item is not a finding without a concrete effect.
- The change does not need to be perfect, but it must preserve code health and production safety.
- Leave out unrelated debt and mechanical checks better handled by tooling.
- Do not ask for general infrastructure to solve a local problem.
- Change size does not replace a concrete finding.
- Leave out praise, routine reasoning, future possibilities, and style comments.
- State conditional findings as conditional; lower confidence does not justify stronger wording.

## Done when

Finish when every changed line is inspected or listed as excluded, the affected behavior has been traced far enough to judge it, each applicable pass is complete, high-risk paths cover normal and failure states, every finding survives challenge, every finding has issue code and fix code, and verification limits are clear.
