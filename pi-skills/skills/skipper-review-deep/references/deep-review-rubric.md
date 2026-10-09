# Deep review rubric

Use this rubric after the base `skipper-review` policy. Apply only categories relevant to the changed surface, but make that relevance decision explicitly.

## Review principles

A reportable issue is:

- introduced, worsened, depended on, or newly exposed by the change
- discrete and actionable
- supported by a reachable scenario and repository evidence
- meaningful to correctness, safety, security, performance, compatibility, operability, usability, or maintainability
- something the author would likely fix if they knew about it

The review should improve code health without requiring perfection. Technical facts, repository contracts, and observed behavior outweigh preferences.

## Change and context map

| Surface | Questions |
|---|---|
| Requirement | What behavior is promised? Are acceptance criteria and intentional breaking changes explicit? |
| Entry points | Which APIs, commands, jobs, events, scheduled tasks, hooks, or deployment resources invoke the change? |
| Consumers | Which modules, services, clients, operators, or users depend on the changed output or side effects? |
| Contracts | Which signatures, schemas, wire names, files, tables, configuration keys, exceptions, and exit codes can change? |
| State | What is persisted, cached, queued, mutated, retried, resumed, migrated, or deleted? |
| Trust boundaries | Where do identities, untrusted input, secrets, sensitive data, external artifacts, or elevated permissions cross? |
| Lifecycle | How is the change deployed, mixed with old versions, rolled back, replayed, restored, or removed? |
| Evidence | Which tests, checks, documentation, history, incidents, or repository rules establish intended behavior? |

## Pass 1: requirement and functional correctness

Check:

- implementation against the stated requirement, not merely the test assertions
- missing branches, inverted conditions, incorrect defaults, and stale values
- empty, zero, negative, maximum, malformed, duplicate, and boundary inputs
- ordering, truncation, precision, units, encoding, locale, timezone, and calendar assumptions
- exception type, exit status, response status, and error propagation
- success reported before required side effects complete
- fallback behavior that hides invalid or incomplete results
- user-visible behavior that is internally consistent but contrary to the intended outcome

## Pass 2: data and state integrity

Check:

- invariants before and after each mutation
- atomicity across database, filesystem, object store, queue, and external API boundaries
- partial writes, stale reads, lost updates, duplicate delivery, and silent omission
- transaction boundaries, commit order, lock duration, and rollback behavior
- idempotency under retry, resume, replay, and repeated scheduling
- deterministic keys, ordering, partitioning, deduplication, and conflict handling
- cleanup ownership for temporary, incomplete, or superseded state
- schema evolution, nullability, defaults, backfills, and old data
- scientific semantics including CRS, units, nodata, dtype, bounds, interpolation, shape, and reproducibility when applicable

## Pass 3: failures, concurrency, and resources

Check:

- dependency timeout, refusal, throttling, malformed response, and partial response
- retry eligibility, retry exhaustion, backoff, jitter, and duplicate side effects
- cancellation and interruption at every external side effect
- races, deadlocks, lock ordering, reentrancy, thread/process safety, and unsafe shared state
- bounded queues, pools, recursion, retries, buffers, context, and work fan-out
- file descriptor, socket, transaction, process, lock, and temporary-file lifetime
- shutdown, signal handling, worker loss, scheduler restart, and orphan cleanup
- whether errors retain enough context without leaking sensitive values

## Pass 4: contracts and compatibility

Check both direct and indirect integration surfaces:

- public and semi-public APIs, events, CLI flags, configuration, environment variables, files, and serialization
- old producer/new consumer and new producer/old consumer behavior
- required deployment and migration ordering
- persisted state that must survive upgrades or resume after deployment
- renamed, removed, reordered, or reinterpreted fields and enum values
- defaults that change behavior without an explicit caller change
- exception, status, output, logging, and metric contracts used by automation
- deprecation path, compatibility shim, feature-flag behavior, and rollback after data conversion

Do not assume `experimental` means unused. Search for actual consumers.

## Pass 5: security, privacy, and supply chain

Identify assets, actors, trust boundaries, and attacker-controlled values. Check:

- authentication bypass, authorization gaps, confused-deputy behavior, and tenant isolation
- injection into SQL, shell, templates, paths, URLs, headers, logs, and interpreters
- path traversal, unsafe archive extraction, unsafe deserialization, and parser differentials
- secret, token, private key, personal data, or customer data exposure in source, logs, errors, caches, artifacts, plans, and telemetry
- validation before normalization and canonicalization-sensitive checks
- network egress, redirects, SSRF, certificate verification, and origin assumptions
- cryptographic misuse, insecure randomness, replay, expiry, and signature scope
- overly broad cloud, CI, Kubernetes, filesystem, database, or service-account permissions
- dependency additions, source integrity, lockfile consistency, build scripts, generated artifacts, and untrusted execution
- fail-open behavior and audit evidence for privileged actions

Report demonstrated exposure separately from optional hardening.

## Pass 6: performance and capacity

Check behavior at realistic scale:

- asymptotic complexity and repeated full scans
- N+1 queries or network requests
- unbounded materialization, buffering, caching, collection, logging, or concurrency
- large copies, serialization, decompression, raster expansion, and dtype inflation
- missing batching, pagination, streaming, indexing, partition pruning, or spatial indexing
- hot-path blocking I/O, lock contention, connection-pool pressure, and retry storms
- query-plan changes, table rewrites, index builds, and deployment-time resource spikes
- backpressure, rate limits, quotas, and behavior at capacity

Require a plausible production input size and impact. Do not flag micro-optimizations without evidence.

## Pass 7: architecture and module depth

Check whether the change increases the number of concepts or leaks decisions across boundaries:

- ownership of policy, state, validation, retries, and lifecycle
- dependency direction and cycles
- duplicated business rules or incompatible sources of truth
- pass-through layers and wrappers that expose as much complexity as they hide
- callers forced to coordinate internal sequencing or know storage/protocol details
- boolean flags, parameter clusters, and configuration knobs exposing implementation choices
- hidden global state, temporal coupling, import-time behavior, and action at a distance
- abstractions introduced for one use without reducing caller complexity
- framework or infrastructure created before a current requirement needs it

Recommend consolidation or a deeper interface only when it fixes concrete change-induced risk. Preserve valid boundaries for compatibility, deployment, security, ownership, and testing.

## Pass 8: operations and release safety

Check:

- actionable logs, metrics, traces, events, and identifiers for the changed failure modes
- accurate health/readiness behavior and alert meaning
- retry exhaustion, quarantine, dead-letter, replay, and operator next steps
- migration, rollout, canary, feature-flag, and mixed-version behavior
- rollback after schema, data, protocol, or infrastructure mutation
- backup, restore, reconciliation, and safe forward-fix paths
- destructive Terraform, Kubernetes, database, CI/CD, storage, and permission changes
- diagnostic behavior when only some partitions, workers, zones, or dependencies fail
- whether success signals can be emitted for incomplete work

Treat undocumented recovery as unverified rather than automatically absent.

## Pass 9: tests and verification quality

Derive scenarios from production behavior before reading test names. Check:

- happy path, validation, boundaries, failure, retry, cancellation, concurrency, compatibility, and regression scenarios relevant to the change
- whether assertions prove outputs and side effects rather than only execution
- whether the test would fail if the suspected defect were reintroduced
- excessive mocking that removes the behavior under test
- fixtures that accidentally avoid realistic scale, old data, mixed versions, permissions, or malformed input
- nondeterminism from time, randomness, ordering, external services, and shared state
- appropriate unit, integration, contract, migration, or end-to-end level
- test-only branches or helpers that diverge from production behavior

Do not request tests mechanically. Name the exact scenario and assertion needed to protect the changed behavior.

## Pass 10: human-facing behavior and documentation

When applicable, check:

- safe and unsurprising defaults
- clear validation and error messages with recovery steps
- CLI discoverability, exit codes, destructive confirmations, and automation behavior
- API error consistency, pagination, idempotency, and permission feedback
- accessibility, keyboard behavior, focus, contrast, labels, and reduced-motion support for UI changes
- README, runbook, migration, configuration, API, and generated documentation affected by the change
- stale comments, examples, and operational commands that now cause incorrect behavior

## Candidate verification checklist

A candidate may be reported only after answering:

1. **Attribution:** Which changed line or deleted patch line introduced, worsened, relied on, or exposed it? For an omission, which changed operation needed the missing behavior?
2. **Reachability:** Which concrete caller, input, state, environment, or ordering reaches it?
3. **Evidence:** Which inspected code, contract, test, schema, configuration, or history supports the claim?
4. **Protection:** Did surrounding validation, transactions, locks, cleanup, retries, or compatibility code already prevent it?
5. **Intent:** Is it clearly unintended rather than an explicit behavior change?
6. **Impact:** What observable failure occurs, and how broad or recoverable is it?
7. **Actionability:** Can the author apply a specific local fix?
8. **Code evidence:** Is the issue excerpt copied exactly from the file or patch? For an omission, does it show the nearest changed operation and name what is missing?
9. **Fix validity:** Does the fix snippet use real project interfaces and preserve relevant guarantees? If it is pseudocode, is that label clear and is the unknown fact named?
10. **Verification:** What focused check fails before and passes after the fix?
11. **Deduplication:** Is this a distinct root cause rather than another symptom?
12. **Severity:** Does the level reflect impact and reachability rather than checklist importance?

## Severity and confidence

Use the base Skipper levels:

- **block**: credible unsafe release path involving corruption, data loss, secret exposure, destructive mutation, outage, unrecoverable deployment, or opaque critical failure
- **request changes**: a required correctness, contract, security, testing, clarity, or maintainability fix before merge
- **simplify**: safe behavior with an optional reduction in unnecessary complexity

Use confidence independently:

- **confirmed**: directly demonstrated by code, a command, or a failing test
- **high**: complete static path and repository evidence establish the behavior
- **medium**: credible path with one limited unresolved fact
- **conditional**: impact depends on a named fact that could not be inspected

Do not raise severity to compensate for lower confidence.

## Source influences

This rubric synthesizes these public review practices rather than copying their output formats:

- [OpenAI Codex review rubric](https://github.com/openai/codex/blob/main/codex-rs/prompts/templates/review/rubric.md): introduced and actionable defects, provably affected code, precise changed-line locations, priority, confidence, and false-positive restraint.
- [OpenAI Codex code-review skills](https://github.com/openai/codex/tree/main/.codex/skills): independent review concerns, complete issue collection, compatibility, testing, repository-specific invariants, and reviewability.
- [Google Engineering Practices: What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html): design, functionality, concurrency, complexity, tests, documentation, every-line inspection, and surrounding system context.
- [Google Engineering Practices: The Standard of Code Review](https://google.github.io/eng-practices/review/reviewer/standard.html): improve code health without requiring perfection and prefer technical evidence over preference.
- [OWASP Code Review Guide](https://owasp.org/www-project-code-review-guide/): manual trust-boundary analysis and vulnerability-focused source review.
