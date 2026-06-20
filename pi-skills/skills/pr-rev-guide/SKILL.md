---
name: pr-rev-guide
description: Generate a structured PR review guide and post it to GitHub as a comment. Use this skill whenever the user asks to create a review guide for a pull request, help reviewers navigate a long or complex PR, group PR files by feature, annotate a PR with a walkthrough, or improve the PR review experience. Trigger on phrases like "generate PR guide", "make the PR reviewable", "add a review walkthrough", "post a PR summary", or any time the user wants to make a pull request easier to review.
---

# PR Review Guide

Generates a structured, opinionated review guide for a GitHub pull request, saves it as a markdown file in the project repository under `pr-reviews/`, and posts it as a comment on the PR. The guide identifies the features the PR implements, clusters files by feature or logical concern, flags risk areas, and tells reviewers where to focus.

**This skill is read-only with respect to the PR itself.** It posts a comment but never edits, merges, closes, or modifies the PR, its title, its body, its labels, its assignees, or its branch.

## Inputs

The user will provide one of:
- A PR number (assumes the current repo): `42`
- A full PR URL: `https://github.com/org/repo/pull/42`
- Nothing (assumes the PR for the current branch)

Optional flags the user may specify:
- `--dry-run` — write the guide file locally but do not post the comment to GitHub

## Step 1: Detect the humanizer skill

Before writing any prose, check whether the humanizer skill is available. In Codex, skills are stored across several scoped locations — search all of them:

```bash
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)

find \
  "${REPO_ROOT}/.agents/skills" \
  "${CODEX_HOME:-$HOME/.agents}/skills" \
  /etc/codex/skills \
  -name "SKILL.md" 2>/dev/null \
  | xargs grep -li "humaniz" 2>/dev/null \
  | head -3
```

If any path is returned, it points to the humanizer SKILL.md. Read that file and apply its writing instructions when composing the Overview, feature summaries, and "what to look for" fields in Step 4.

If nothing is returned, proceed with clear, direct, plain-English prose: short sentences, no filler phrases, no hedging language.

## Step 2: Gather PR context

Run the following read-only commands to collect the raw material. Substitute the PR number or URL wherever `<PR>` appears. If the user provided nothing, omit the argument and `gh` will resolve the PR for the current branch.

```bash
# PR metadata and stats
gh pr view <PR> --json title,body,baseRefName,headRefName,additions,deletions,changedFiles,url,number

# Commit messages — primary signal for identifying features
gh pr view <PR> --json commits --jq '.commits[].messageHeadline'

# File-level stat summary
gh pr diff <PR> --stat
```

If `changedFiles` > 80 or `additions + deletions` > 5000, this is a large PR. See the **Large PR handling** section below before pulling the full diff.

For normal-sized PRs, pull the full diff:

```bash
gh pr diff <PR>
```

## Step 3: Identify features and cluster files

This step has two layers: first identify what features the PR delivers, then cluster files under those features.

### 3a. Feature identification

Read the commit messages and the existing PR body (if any) to infer the discrete features or changes this PR implements. A "feature" here is any user-visible behaviour, infrastructure change, or refactor that has an identity of its own — something a reviewer could describe in one sentence to a colleague.

Aim for 2–6 features. If the PR is a single atomic change, one feature is fine. If the commits reveal no clear feature boundary, use logical concerns (data layer, API layer, config, etc.) as the grouping dimension instead — but still frame them as "what this part does", not just "what kind of files these are".

Examples of well-framed features:
- "Adds JWT-based authentication to the API gateway"
- "Migrates scene metadata storage from Redis to PostgreSQL"
- "Backfills the `acquired_at` column for historical satellite records"

### 3b. File clustering

With features identified, assign every changed file to exactly one feature. Use the following signals:

- **Directory structure**: files under the same module or layer are likely the same concern
- **Import relationships**: if file A is changed and file B imports A, they share a concern
- **Commit messages**: commits often encode intent that file paths alone do not
- **File type patterns**: migration files, test files, config files, and schema definitions are each attached to whichever feature they support, not grouped together as a type

Every file must be assigned. If a file belongs to no feature (e.g. a lockfile update, a changelog entry), place it in a "Supporting / housekeeping" group at the end.

For each feature group, determine:

- **Feature name**: short, plain-English label
- **Risk level**: `low`, `medium`, or `high` — based on blast radius, shared state, external contracts, or absence of tests
- **What it does**: 2–3 sentences on what this feature implements and enables, written for a reviewer with no prior context
- **Review points**: 2–4 named concerns, each consisting of:
  - A short title labelling the concern (e.g. "Upsert atomicity", "Timezone enforcement")
  - 1–2 sentences explaining why it matters and what to verify
  - A code snippet (5–10 lines max) when a snippet genuinely clarifies the point — omit if prose is sufficient
  - An opinionated suggestion when the current implementation could be improved, referencing a known pattern, library, or prior art if relevant — omit if the implementation looks correct
- **Files**: list of paths in the group — placed last, after the review points

The review points are the primary value of each feature block. File paths give the reviewer a navigation anchor; they are not the starting point.

### 3c. Extract interface changes

Scan the diff for changes to any of the following interface types. For each one found, record the before state (removed `-` lines) and after state (added `+` lines) as a side-by-side pair.

Interface types to look for:
- **Function/method signatures** — `def` in Python, exported functions in TypeScript/JavaScript
- **Pydantic model fields** — class bodies inheriting from `BaseModel`
- **SQLAlchemy column definitions** — `Column(...)` or mapped column declarations
- **Database migration column ops** — `op.add_column`, `op.alter_column`, `op.drop_column`
- **API route signatures** — FastAPI/Flask decorators and their handler signatures
- **Environment variable reads** — `os.getenv(...)`, `os.environ[...]`, `settings.*` assignments
- **Configuration keys** — additions or removals in config dataclasses or `config.toml`-style files

A change qualifies only if the interface boundary itself changed — not just the implementation body. A function whose signature is unchanged but whose body changed does not qualify. A column whose type or nullability changed does qualify.

Attach each interface change pair to its feature group. One feature may have zero, one, or several pairs. If a pair cannot be cleanly attributed to a feature, attach it to the nearest feature by file proximity.

### 3d. Check for expected co-changes

Before composing the guide, run the following checks against the file list from the stat summary. These are not style preferences — they are structural invariants that a missing change often violates.

For each rule, note whether the companion change is **present**, **absent**, or **not applicable**.

| Trigger (found in diff) | Expected companion |
|---|---|
| New or altered `Column(...)` in a SQLAlchemy model | Alembic migration file touching the same table |
| New Alembic migration | Corresponding SQLAlchemy model change (or explicit note that model is auto-generated) |
| New `os.getenv(...)` or `os.environ[...]` call | Entry in `.env.example` or equivalent |
| New API endpoint (route decorator) | Updated OpenAPI/schema file, if the project maintains one |
| Renamed or removed public function | Updated call sites and tests |
| New required config key | Entry in deployment config, README, or `config.toml` template |
| New dependency in `pyproject.toml` / `package.json` | Corresponding usage in source (no phantom deps) |

To check for `.env.example` entries without reading the full file:
```bash
# Check if a variable name appears in .env.example
grep -n "VARIABLE_NAME" "$(git rev-parse --show-toplevel)/.env.example" 2>/dev/null
```

To check if a migration exists for a model change:
```bash
# List migration files touched in this PR
gh pr diff <PR> --name-only | grep -E "migrations?/"
```

Record each **absent** co-change. These will populate the "Missing co-changes" section of the guide. Do not flag co-changes that are absent because they are genuinely not applicable (e.g. a project with no `.env.example` convention).

## Step 4: Compose the guide

Read `references/guide-template.md` before writing any output. Fill the template with the features and clusters identified above.

Key principles:

**What it does:** Describe the outcome, not the edit. Avoid "this file was changed to" — say what the system now does that it did not do before.

**Review points:** These are the core of each feature block. For each point:
- The title should name the concern precisely: "Upsert atomicity" is better than "Check the database code".
- The explanation should tell the reviewer what to verify and why it matters — not just that they should look.
- Include a snippet only when the code pattern is the point. A 6-line example of a correct vs. incorrect upsert is useful. A snippet that just shows which file was edited is not.
- The suggestion block is for genuine improvement opportunities. Reference prior art, a specific library, a PostgreSQL feature, a language idiom, or a pattern from the codebase if relevant. Do not fill it with vague encouragement. Skip it entirely if the implementation is fine.

**Interface changes:** Include this section in a feature block only when at least one qualifying interface change was found in Step 3c. Show before and after as a fenced diff block — not as prose description. Keep each pair to the changed lines only, not the full function body. If there are multiple pairs in one feature, show them as separate labelled sub-blocks.

**Missing co-changes:** Populate this section from the absent findings in Step 3d. Each entry should name the trigger change, the expected companion, and why the gap matters. If all expected companions are present, write "No missing co-changes identified." Do not list items that were marked not applicable.

**Line budget:** The guide will be longer than before given the richer per-feature blocks. Prioritise depth over brevity within each review point, but avoid padding. The guide should stop when it has said what needs saying.

**Humanizer:** If the humanizer skill was found in Step 1, apply it to all prose sections: the "What this PR does" paragraph, each "What it does" block, each review point explanation, and the cross-cutting concerns prose. Do not apply it to code snippets, file path lists, or risk labels.

## Step 5: Save the guide file

Resolve the repository root and build all paths from it — do not use `/tmp` or any path outside the repository:

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
GUIDE_DIR="${REPO_ROOT}/pr-reviews"
GUIDE_FILE="${GUIDE_DIR}/pr-${PR_NUMBER}-review-guide.md"

mkdir -p "${GUIDE_DIR}"
```

Write the composed guide to `${GUIDE_FILE}`. Tell the user the full path so they can commit it alongside the branch or share it independently.

The `pr-reviews/` directory is intentionally checked into the repository. Add it to `.gitignore` only if the team prefers not to persist review guides in version history.

## Step 6: Post the guide as a comment

The only GitHub write operation this skill performs is adding a comment. The PR body, title, labels, and branch are never touched.

Unless `--dry-run` was specified, post the saved file as a new PR comment:

```bash
gh pr comment <PR> --body-file "${GUIDE_FILE}"
```

After posting, print the direct PR URL:

```bash
gh pr view <PR> --json url --jq '.url'
```

If `--dry-run` was specified, skip `gh pr comment` entirely. Print `${GUIDE_FILE}` and note that the comment was not posted.

---

## Large PR handling

When `changedFiles` > 80 or `additions + deletions` > 5000:

1. Use the stat summary and the GitHub REST API (read-only) to retrieve file-level metadata without pulling the full patch:

   ```bash
   gh api repos/{owner}/{repo}/pulls/{pull_number}/files --paginate \
     --jq '.[] | {filename, additions, deletions}'
   ```

2. Pull full diffs only for the 10 highest-churn files to inform the "what to look for" items.

3. Note in the guide header that this is a large PR and the walkthrough is based on file-level metadata plus targeted diff sampling. Recommend that the reviewer use the GitHub "Files changed" tab filter to isolate each feature group.

4. Add a "Suggested review order" section listing features from lowest to highest risk.

---

## Allowed commands

This skill interacts with GitHub exclusively through the following commands. No other `gh` subcommands that modify PR state are permitted.

**Allowed (read + comment only):**
```
gh pr view          — read PR metadata
gh pr diff          — read the diff (full or --stat or --name-only)
gh pr comment       — post a new comment (only write operation)
gh api GET paths    — read file metadata via the REST API
git rev-parse       — locate the repository root
grep                — search for patterns in local files
mkdir -p            — create pr-reviews/ if needed
```

**Never run:**
```
gh pr edit         — modifies PR body, title, labels, assignees
gh pr merge        — destructive
gh pr close        — destructive
gh pr review       — submits a formal review state (approve / request-changes)
gh pr ready        — changes draft status
gh pr lock         — modifies PR state
gh pr reopen       — modifies PR state
gh pr update-branch — modifies the branch
```

If the user asks this skill to do something that would require a command in the "Never run" list, decline and explain that this skill is read-only with respect to the PR.

---

## Reference files

- `references/guide-template.md` — the markdown template to fill in. Read this before writing any guide output.

---

## Failure modes to avoid

- **Do not invent behaviour that is not in the diff.** If you cannot tell what a change does, write "purpose unclear from diff — author should clarify" rather than guessing.
- **Do not treat tests as a standalone feature group.** Attach them to the feature they cover. Note coverage gaps in the cross-cutting section.
- **Do not run `gh pr comment` if `--dry-run` was specified.**
- **Do not write the final guide file outside `${GUIDE_FILE}` (i.e., outside `pr-reviews/` in the repo root). Never use `/tmp` as the output destination.**