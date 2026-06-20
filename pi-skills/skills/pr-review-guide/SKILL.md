---
name: pr-review-guide
description: generate a reviewer guide for a github pull request or branch diff, especially when the pr is long or hard to review. use when the user asks to summarize a pr, group changed files by feature, create a review map, write a reviewer guide, save a guide under pr-reviews/, or post a review guide comment to github. supports the current branch by default and can also work on an explicitly named pr. uses gh when available and authenticated, otherwise falls back to local git-only mode and creates only a local guide file.
---

Generate a reviewer-focused guide that reduces cognitive load. The goal is to explain what changed, group files into meaningful review clusters, highlight risk, and suggest a review path.

## Workflow

1. Run `scripts/collect_pr_context.py` from the repository root.
2. Read the JSON output and determine whether `collection_source` is `gh` or `local-git`.
3. If `collection_source` is `gh`, use PR metadata and changed files to draft the guide.
4. If the script fell back to `local-git`, tell the user clearly that `gh` is unavailable or unauthenticated, the guide will only be written locally, and they must paste or post it themselves if they want it on GitHub.
5. Infer 2 to 7 review clusters from the files, commits, PR title/body, and directory structure.
6. Draft the guide in markdown using the structure from `references/guide-template.md`.
7. If a `humanizer` skill is available in the client setup, use it on the final prose before writing or posting. Keep the result compact and direct.
8. Write the final markdown file into `pr-reviews/` using this filename pattern:
   - `<current-branch>-into-<base-branch>-<yyyy-mm-dd>-pr-review-guide.md`
9. If the user asked for a GitHub comment and `gh` is available plus authenticated, post the same markdown file as a normal PR comment by running `scripts/post_pr_comment.sh <pr-number> <markdown-file>`.
10. Report what was created, where it was saved, whether a comment was posted, and any fallback or uncertainty.

## Inputs and defaults

- Default target: the PR for the current branch.
- If the user explicitly mentions another PR or branch, follow that request.
- If no PR can be resolved with `gh`, still generate the local guide from git diff information.

## Non-destructive rules

Never run commands that modify code, git state, or PR state beyond a plain PR comment.

Forbidden examples:
- `git commit`
- `git push`
- `git pull`
- `git merge`
- `git rebase`
- `git checkout`
- `git switch`
- `gh pr edit`
- `gh pr merge`
- `gh pr ready`
- deleting files outside `pr-reviews/`

Allowed examples:
- `git rev-parse`
- `git diff`
- `git log`
- `gh pr view`
- `gh pr diff --name-only`
- `gh pr comment`
- creating `pr-reviews/` and writing a guide there

## Guide requirements

Always include these sections unless the PR is extremely small:

## PR review guide

### What this PR does
Summarize the practical purpose in one short paragraph.

### Features and clusters
Group the files by feature, subsystem, or review surface. For each cluster include:
- what changed
- why the reviewer should care
- the relevant files
- what to focus on
- risk level: high, medium, or low

### High-risk areas
Call out migrations, auth, permissions, billing, API contract changes, background jobs, concurrency, infra, or broad refactors.

### Low-risk or skimmable areas
Call out generated files, lockfiles, snapshots, mechanical renames, repetitive tests, or pure formatting.

### Suggested review path
Recommend a reading order. Start with the smallest set of files that explains the shape of the PR.

### File list
Provide the grouped file list by cluster.

## Clustering heuristics

Use the most concrete evidence available, in this order:
1. PR title and body
2. commit subjects
3. top-level directories
4. filename patterns
5. tests matching implementation files

Useful cluster labels:
- api surface
- backend logic
- data model or migrations
- frontend ui
- infra or deployment
- tests
- docs
- cleanup or refactor

When the evidence is weak, say so plainly. Example: `This cluster is inferred mostly from filenames and directory layout.`

## Writing rules

- Keep it compact.
- Use plain language.
- Do not use em dashes.
- Do not overpraise the PR.
- Prefer short paragraphs and short bullets.
- Avoid title case headings.
- Use straight quotes.
- Mention uncertainty honestly.

## Output behavior

When complete:
- confirm the file path under `pr-reviews/`
- confirm whether the GitHub comment was posted
- if `gh` was unavailable, state the fallback clearly and tell the user they need to paste or post the guide themselves
