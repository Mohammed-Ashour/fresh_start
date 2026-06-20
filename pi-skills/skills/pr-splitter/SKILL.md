---
name: pr-splitter
description: safely split oversized pull requests or branches into smaller scoped pull requests. use when asked to decompose a large diff, split an existing pr, create a stacked-pr plan, separate refactors from behavior changes, reduce review size, or verify that a split preserves the original branch. default to plan-only mode until the user approves branch, commit, push, or pr creation.
---

# PR Splitter

Split a large PR into smaller reviewable PRs while preserving the final code exactly.

Default to **plan-only mode**. Do not create branches, commits, pushes, or PRs until the user explicitly approves the split plan.

## Inputs

Use whatever is available:

- Current branch and a base branch.
- Existing PR number or URL.
- Explicit target base, such as `main`, `develop`, or `origin/main`.
- Constraints, such as max files per PR, max line count, preferred PR count, required stack order, or files that must stay together.

If no base is provided, infer it in this order:

1. The PR base from `gh pr view`, if this is a GitHub PR.
2. The upstream tracking branch merge base.
3. `origin/main`.
4. `main`.
5. Ask for the base only if none can be inferred safely.

## Safety rules

- Keep the original branch unchanged until the split is verified.
- Never drop, rewrite, or hand-edit hunks silently.
- Never create branches, commits, pushes, or PRs without explicit approval.
- Keep code and its direct tests together unless the tests are independent infrastructure.
- Keep generated files with the source that generated them.
- Keep lockfiles with dependency manifests.
- Keep migrations, schemas, and model or API code together when they depend on each other.
- Prefer stacked PRs only when one PR truly depends on another.
- Document merge order for every stack.
- Verify that the cumulative split diff equals the original diff before publishing.

## Simple workflow

### 1. Inspect

Run read-only checks first:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main
git diff --stat <base>...HEAD
git diff --name-status <base>...HEAD
git diff --numstat <base>...HEAD
git diff <base>...HEAD
```

For GitHub PRs, also use:

```bash
gh pr view --json number,title,baseRefName,headRefName,url,state,isDraft
gh pr diff --name-only
gh pr diff
```

If `gh` is unavailable, continue with local git data and state that GitHub metadata was unavailable.

### 2. Group by intent

Group hunks by purpose, not just by file:

1. Foundation or compatibility scaffolding.
2. Pure refactor with no behavior change.
3. API, schema, migration, or data-contract change.
4. Implementation by feature, subsystem, or endpoint.
5. Tests that validate the matching code.
6. Docs, examples, cleanup, or generated follow-up.

Only split within one file when the hunks are independent and can be applied without conflict.

### 3. Build the dependency graph

For each proposed PR, identify:

- What it changes.
- What it depends on.
- Whether it can merge independently.
- Which validation command proves it is safe.

Use independent PRs when possible. Use a stack only when required.

### 4. Output the plan

Use this exact shape:

```markdown
## PR split plan

Base: <base branch or sha>
Original branch: <branch and sha>
Mode: plan only

### Summary
- Original size: <files, insertions, deletions>
- Proposed PRs: <count>
- Stack shape: <independent | stacked | mixed>
- Main risks: <short list>

### PRs
1. <title>
   - Branch: <branch-name>
   - Base: <base or parent branch>
   - Scope: <one sentence>
   - Include: <files or hunk groups>
   - Exclude: <important exclusions>
   - Depends on: <none or PR number>
   - Validation: <commands>
   - Risk: <risk and mitigation>

2. <title>
   - Branch: <branch-name>
   - Base: <base or parent branch>
   - Scope: <one sentence>
   - Include: <files or hunk groups>
   - Exclude: <important exclusions>
   - Depends on: <none or PR number>
   - Validation: <commands>
   - Risk: <risk and mitigation>

### Verification
- Confirm every original hunk is assigned once.
- Confirm no hunk is duplicated.
- Reconstruct the final stack.
- Compare the final cumulative diff to the original diff.

### Approval needed
Approve before I create branches, commits, pushes, or PRs.
```

### 5. Apply only after approval

After approval:

1. Create a backup branch:

```bash
git branch backup/pr-split-original-$(date +%Y%m%d-%H%M%S) HEAD
```

2. Create each split branch from its planned base.
3. Apply only the assigned hunks using precise patching, such as `git checkout -p`, `git restore -p`, or `git apply --cached`.
4. Commit each PR with a scoped message.
5. Run the planned validation for each PR.
6. Run final stack verification.
7. Push and create PRs only after validation passes or the user explicitly accepts the remaining failures.

## Final verification

Prefer exact diff comparison:

```bash
git diff --binary <base>..<original-head> > /tmp/pr-split-original.diff
git diff --binary <base>..<final-split-head> > /tmp/pr-split-final.diff
git diff --no-index /tmp/pr-split-original.diff /tmp/pr-split-final.diff
```

If patch equality is not possible because commits were reordered, compare final file contents:

```bash
git diff --exit-code <original-head> <final-split-head>
```

If verification fails, stop and report the missing, duplicated, or changed paths before doing anything else.
