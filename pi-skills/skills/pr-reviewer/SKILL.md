---
name: pr-reviewer
description: in-depth pull request and branch review for github repositories, local branches, pasted diffs, or patch files. use when asked to review code changes, assess merge readiness, inspect architecture impact, evaluate python data engineering, geospatial, scientific computation, database, api, cli, or test changes, and produce a local review report with severity-ranked findings while minimizing review noise.
---

# PR Reviewer

## Purpose

Perform a balanced, high-signal review of a GitHub pull request, local branch diff, pasted diff, or patch. Focus on correctness, architecture impact, module design, database safety, API or CLI user experience, and test quality. Prefer a concise local report over inline PR comments unless the user asks otherwise.

## Default Review Workflow

1. Identify the review source:
   - GitHub PR URL or PR number: inspect the PR diff and changed files if repository access exists.
   - Local branch: compare against the stated base branch, or infer the default base branch when reasonable.
   - Pasted diff or patch: review only provided content and state missing context.
   - If nothing is provieded, review the current working branch against its default base branch.
2. Build context before judging:
   - Summarize changed files, touched entry points, affected modules, data paths, schemas, public interfaces, tests, and dependencies.
   - Inspect nearby code when available and needed to validate a finding.
   - For Python data, geospatial, or scientific code, check assumptions around coordinate systems, CRS, units, array shapes, nodata handling, dtype precision, chunking, vectorization, memory usage, and reproducibility.
3. Review with the rubric in `references/review-rubric.md` when the PR is non-trivial or when module design, tests, DB changes, API/CLI UX, or architecture impact are relevant.
4. Produce a local review report. Prioritize findings that are actionable and likely to matter. Avoid listing every minor preference.

## Severity Scale

Use these labels consistently:

- **Critical**: likely production incident, data loss, security issue, broken migration, severe numerical or scientific invalidity, or broadly broken functionality.
- **High**: serious correctness, architecture, data, API, DB, or testing issue that should usually block merge.
- **Medium**: meaningful maintainability, edge-case, performance, design, or UX issue worth fixing before or soon after merge.
- **Low**: minor clarity, naming, small test improvement, or local cleanup.
- **Nit**: style preference that should not block merge.

## Finding Requirements

Each finding must include:

- Severity
- Category, such as correctness, architecture, module design, DB, API/CLI UX, tests, performance, security, maintainability
- Location, using file path and symbol or line reference when available
- A sample code snippet when relevant to illustrate the issue, ideally with line numbers for clarity
- Confidence, one of: confirmed from diff, likely from surrounding code, needs verification, question for author
- Issue
- Why it matters
- Recommendation
- Merge impact, such as blocks merge, should fix soon, optional cleanup, or question only

Do not invent certainty. If the evidence is incomplete, mark the finding as a question or needs verification.

## Noise Control

- Lead with the most dangerous issues.
- Prefer no more than 10 primary findings unless the PR is large or risky.
- Do not repeat the same issue across many files. Group related instances.
- Do not flag broad best-practice advice unless it applies directly to the diff.
- Do not block merge for style-only concerns.
- Include positive notes only when they are specific and useful.

## Output Format

Use this structure by default, adapting sections only when clearly irrelevant:

```markdown
# PR Review

## Summary
- Merge recommendation: approve / request changes / needs author clarification
- Overall risk: critical / high / medium / low
- Main concerns:

## Changed Surface Area
- Code:
- Data or DB:
- API or CLI:
- Tests:
- Architecture:

## Blocking Findings

### [Severity] Category
Location:
Confidence:
Merge impact:
Issue:
Why it matters:
Recommendation:

## Non-blocking Findings

## Architecture and Module Design Review

## Database Review

## API or CLI UX Review

## Test Review

## Questions for Author

## Specific Positive Notes
```

If there are no findings in a section, write `No material issues found from the available context.`

## Review Stance

Be direct, specific, and balanced. The goal is to help the author merge safer code with minimal noise. When making recommendations, prefer concrete alternatives over vague advice.
