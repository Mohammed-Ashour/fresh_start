---
name: skipper-review
description: "review a pull request, diff, branch, commit, or uncommitted change in python, airflow, scientific and geospatial computing, terraform, kubernetes, ci/cd, databases, or data pipelines. For science-model PRs, assess the applicable Stage 0-5 maturity gate. Find concrete problems in correctness, recovery, security, operations, contracts, tests, and unnecessary complexity. Compare the change with its requirement and repository conventions, recommend the smallest safe fix, and separate required fixes from optional simplifications. Do not use for repository-wide audits, general explanations, or requests to implement fixes."
---

# Skipper review

## Goal

Decide whether the change is a small, safe production change.

Correctness, recovery, security, and production diagnosis matter more than reducing code. Simplicity still matters when extra machinery makes those areas harder to reason about. Review only; do not edit files unless the user asks for fixes.
When multiple implementations provide the same level of robustness and correctness, prefer the simplest, most Pythonic solution.

## Priorities

When instructions conflict, use this order:

1. The user's requirement and acceptance criteria.
2. Repository contracts and established conventions.
3. Concrete correctness, security, recovery, and operational risks.
4. YAGNI, KISS, and the implementation ladder.
5. Style preferences that do not affect behavior.

A familiar or general design is not automatically better. Ask for a larger design only when the local fix would leave the system unsafe or inconsistent.

## Engineering references

For a non-trivial review, first read [references/core-principles.md](../skipper-core/references/core-principles.md). Then read only the references that match the changed stack:

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

Repository policy wins when it conflicts with a default in these references, unless that policy causes the defect or breaks an explicit requirement or safety invariant.

## Science review mode

Use this mode when the user identifies the current branch as a science-model, asks for
a science review, or names a Stage 0 through Stage 5 maturity gate. Use this as an addition to
the existing references for this skill.

1. Read [../science-pr-review/references/review-lifecycle.md](../science-pr-review/references/review-lifecycle.md).
2. Identify the requested stage. If none is provided, infer the earliest unmet
   stage from the available evidence. State the assumption and missing evidence.
3. Read only the matching stage reference:
   - Stage 0: [../science-pr-review/references/stage-0-prototype.md](../science-pr-review/references/stage-0-prototype.md)
   - Stage 1: [../science-pr-review/references/stage-1-structural-design.md](../science-pr-review/references/stage-1-structural-design.md)
   - Stage 2: [../science-pr-review/references/stage-2-restructuring.md](../science-pr-review/references/stage-2-restructuring.md)
   - Stage 3: [../science-pr-review/references/stage-3-implementation-refinement.md](../science-pr-review/references/stage-3-implementation-refinement.md)
   - Stage 4: [../science-pr-review/references/stage-4-polishing.md](../science-pr-review/references/stage-4-polishing.md)
   - Stage 5: [../science-pr-review/references/stage-5-final-merge.md](../science-pr-review/references/stage-5-final-merge.md)
4. Apply the selected stage's scope and exit criteria when deciding whether a
   finding blocks progression. Defer later-stage concerns rather than treating
   them as defects in Stages 0-2.
5. Still report safety-critical risks as blockers at every stage, including
   credible data loss, security exposure, unsafe infrastructure changes, or
   unrecoverable production failures.

For science review mode, integrate the stage assessment to the general output of this skill.

Add a section `## Stage assessment`: describing the current stage, and readiness outcome.

## Workflow

### 1. Set the boundary

Identify:

- the base and head of the change
- the intended behavior
- the runtime, data, infrastructure, and release boundaries involved
- checks that already exist
- anything the user excluded

Use the diff, issue, tests, and nearby code to answer these questions. Ask only if there is no meaningful base or requirement to review against.

### 2. Read the change in context

Read each changed file in full and enough callers, tests, schemas, configuration, and deployment code to understand the result. A diff hunk by itself is rarely enough.

Keep the review tied to the change. Report a pre-existing problem only when the change worsens it, relies on it, or makes it reachable in a new way.

### 3. Look for the smaller safe implementation

For each material part of the change, work down this list:

1. Remove or simplify code or configuration.
2. Reuse code or conventions already in the repository.
3. Use a standard-library or first-party platform feature already available.
4. Use a dependency the project already approves.
5. Keep only the new code needed for the current requirement.

Recommend an earlier option only when it fully meets the requirement without hiding behavior or weakening safety.

### 4. Check the risks

Start with:

- wrong or incompatible behavior
- corruption, loss, duplication, or silent omission of data
- unsafe retries, partial failures, cancellation, or concurrent execution
- authentication, authorization, secrets, permissions, and trust boundaries
- destructive or surprising infrastructure changes
- weak diagnosis, rollback, replay, or recovery
- complexity that makes any of these risks more likely

Apply the stack references only where they fit the change.

### 5. Verify candidate findings

Use repository evidence. Run focused, non-destructive checks when they can settle a question, such as tests, type checks, linters, DAG imports, schema validation, Terraform validation, plans, or manifest rendering.

Report the observed result of every command you mention. If a credible issue still depends on an unknown fact, label it conditional and say how to confirm it.

### 6. Keep only useful findings

Each finding needs:

- a precise location
- evidence from the change and relevant context
- a reachable execution path or a concrete maintenance cost
- the impact
- issue code
- fix code
- a focused verification method

Issue code is the smallest exact excerpt that shows the problem. It may come from source, configuration, a manifest, a query, a command, or the patch itself. For a missing check or other omission, quote the nearest changed call site or diff context and name what is absent.

Fix code is a short replacement snippet or unified diff that shows the smallest safe correction. Keep the original language and indentation. If missing context prevents an exact edit, label the snippet as pseudocode and list the fact that must be confirmed. Never invent a project API.

Group repeated symptoms under their root cause. Leave out speculative extensibility concerns, personal preferences, and generic advice with no current impact.

## Decisions and finding levels

Choose one overall decision:

- **approve**: no material issue in the inspected scope
- **simplify**: behavior is safe; only optional complexity reductions remain
- **request changes**: at least one required fix remains before merge
- **block**: the change has a credible path to corruption, data loss, secret exposure, destructive infrastructure changes, outage, an unrecoverable deployment, or a critical failure that operators cannot diagnose

Use the same levels for findings where they apply:

- **block**: merging or releasing is unsafe
- **request changes**: fix before merge
- **simplify**: optional cleanup that reduces real complexity

Base severity on reachability and impact, not on a missing check by itself.

## Evidence rules

- Cite `path:line` or the narrowest useful location.
- Copy issue code exactly from the inspected file or patch.
- Make fix code consistent with interfaces and conventions you inspected.
- Separate facts from inferences and state assumptions that affect the result.
- Never invent test results, runtime behavior, conventions, or production evidence.
- Ask for the smallest test or check that protects the changed behavior, not tests for their own sake.
- Do not block on unrelated debt or recommend a rewrite when a local fix works.

## Output

Lead with findings, ordered by severity and impact. Explain each issue so the reader can understand the failure and its consequences without reconstructing the code first. Keep the review rigorous; change the presentation, not the evidence standard.

Read [../show-me/SKILL.md](../show-me/SKILL.md) and [../unslop/SKILL.md](../unslop/SKILL.md) before writing the report. Use the repository copies, not an assumed global installation.

### Explain each issue

1. Use a plain-language title that names what breaks. Keep the finding ID, level, precise `path:line`, and confidence easy to find.
2. Start with one concrete scenario: what the user does, what input arrives, or which tasks run together. Name any assumption the scenario depends on.
3. Show the mechanism with the smallest useful view: a text flow, timeline, side-by-side lanes, call tree, Mermaid diagram, or short code diff. Use expected versus actual when that makes the failure clearer. For a trivial defect, the issue/fix diff can be the whole visual; do not add a decorative diagram.
4. Say **The problem:** in plain language, tied to the inspected evidence. Explain unfamiliar framework behavior instead of relying on its name.
5. Say **Impact:** with the observable consequence: rejected repair, missing output, wrong result, failed task, leaked secret, or extra work. Separate what was demonstrated from what remains conditional. If a safety guard prevents corruption, say that rather than claiming corruption occurs.
6. Say **What's needed:** with the smallest safe correction. Keep exact issue code, fix code, evidence paths, and a focused verification check after the explanation. Do not lead with a checklist of metadata or repeat the same explanation under several labels.

Use real identifiers from the inspected change. An illustrative date or value is fine if clearly hypothetical, but do not invent an error message, API, dependency, runtime result, or executed test. Do not create HTML artifacts or open a browser unless the user asks for them.

An illustrative finding shape:

````markdown
### SK-001: [request changes] Renamed events stop reaching existing consumers
`src/events.py:41` · Confidence: high

A new producer sends an event to a consumer that still expects the old name.

```text
Expected: producer -> "item/completed" -> consumer handles it
Actual:   producer -> "item/done"      -> consumer ignores it
```

**The problem:** The producer changed the wire name, but the deployed consumer still matches the old one.

**Impact:** The operation finishes without notifying that consumer.

**What's needed:** Preserve the existing wire name until both sides support the replacement.

Issue and fix:
```diff
- EVENT_NAME = "item/done"
+ EVENT_NAME = "item/completed"
```

Evidence: `src/consumer.py:73` matches `"item/completed"`.
Verification: Test the new producer against the existing consumer.
````

When findings sound similar, add a short distinction only if it helps: for example, "one fails because later results already exist; the other fails because later work starts too early." Do not add a comparison table by default.

After the findings, add the overall decision and inspected scope when they help. Report checks with their observed results, or write `not run` and give the reason. Mention residual risk only when it limits the review. Preserve science review mode's stage assessment when applicable.

Leave out empty sections, praise, routine tool narration, generic advice, speculative future work, and style-only comments.

If there are no findings, say `No actionable findings.` Then report the inspected scope, verification, and any material residual risk. Do not manufacture an issue or diagram to fill the format.

Apply `unslop` to the prose before returning the report. Preserve findings, severity, confidence, evidence, paths, line numbers, commands, diagrams, and exact code excerpts. Simplify the wording without deleting uncertainty or strengthening a claim.

## Done when

Finish when the scope and intended behavior are clear, every finding is evidenced and actionable, severity matches the impact, the smallest safe fix is shown, and verification limits are stated plainly.
