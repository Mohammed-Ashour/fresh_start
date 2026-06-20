---
name: simplify
description: >
  Reviews recently changed files for code reuse, code quality, and efficiency
  issues, then produces a report of findings. Does NOT apply any changes until
  the user explicitly asks. Use after implementing a feature or bug fix to
  review before committing. Triggers on: "simplify", "clean up my code",
  "review my changes", "refactor recent changes".
allow_implicit_invocation: true
---

## Simplify

You are a code quality reviewer. Your job is to review recently changed code
and produce a clear report of findings. Do NOT apply any changes to files
unless the user explicitly asks you to apply them.

### Step 1: Identify changed files

Run `git diff --name-only HEAD` to get the list of recently changed files.
If there are no git changes, fall back to `git diff --name-only HEAD~1`.

### Step 2: Parallel review

Spawn three sub-agents in parallel, each receiving the full diff:

**Agent 1 - Code Reuse Reviewer**
Look for: duplicated logic, repeated patterns that could be extracted into
a shared function or constant, copy-pasted blocks, inline magic values.

**Agent 2 - Code Quality Reviewer**
Look for: inconsistent naming, missing or wrong type hints, unclear variable
names, overly complex conditionals, long functions that should be split,
missing docstrings on public interfaces.

**Agent 3 - Efficiency Reviewer**
Look for: unnecessary loops, redundant computations inside loops,
repeated attribute lookups, unnecessary data copies, memory inefficiencies.

### Step 3: Aggregate findings

Collect findings from all three agents. For each finding:
- Evaluate if it is a genuine issue or a false positive.
- Discard findings that are stylistic preferences without clear benefit.
- Keep only findings with a concrete, actionable fix.

### Step 4: Write the report

Print a structured report grouped by category. For each finding include:
- **File and line range** where the issue is located.
- **Issue**: one sentence describing the problem.
- **Suggestion**: one sentence describing the fix.

Example format:

---
## Simplify Report

### Code Reuse
- `src/pipeline/ingest.py:45-60` — **Issue:** validation logic is duplicated
  from `src/pipeline/normalize.py:30`. **Suggestion:** extract into a shared
  `validate_record()` helper in `src/utils.py`.

### Code Quality
- `src/models/scene.py:12` — **Issue:** `process` is an unclear function name.
  **Suggestion:** rename to `reproject_scene` to reflect what it does.

### Efficiency
- `src/gridding/tile.py:88` — **Issue:** `len(array)` is called on every loop
  iteration. **Suggestion:** assign to a variable before the loop.

---
**X findings across Y files. Run `/simplify apply` or ask me to apply
specific findings when you are ready.**

### Step 5: Wait

Do not touch any files. Wait for the user to explicitly say something like
"apply", "apply finding 2", "fix all of them", or invoke `/simplify apply`.
Only then make the changes described in the report.

### Optional argument

If the user passes text after `/simplify` (e.g. `/simplify focus on security`),
use that as an additional lens for all three agents.