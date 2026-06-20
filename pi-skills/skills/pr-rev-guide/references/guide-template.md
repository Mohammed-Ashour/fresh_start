# Review Guide

> **PR #{{PR_NUMBER}}:** {{PR_TITLE}}
> Changes: <span style="color:green">+{{ADDITIONS}}</span> <span style="color:red">-{{DELETIONS}}</span> across {{CHANGED_FILES}} files

---

## What this PR does

{{2–3 sentences. Plain English. What does the PR deliver and why? Name the features explicitly. No file names here.}}

**Features in this PR:**
- {{Feature 1 — one sentence}}
- {{Feature 2 — one sentence}}

---

## Feature groups

---

### Feature 1: {{FEATURE_NAME}} · `{{RISK_LEVEL}}` risk

**What it does**
{{2–3 sentences. What does this feature enable that was not possible before? Describe the outcome, not the edit.}}

**Interface changes**

<!-- Include this section only if a qualifying interface change was found (signature, schema field, column definition, route, env var). Remove entirely if none. -->

`{{ShortLabel — e.g. "SceneRecord.acquired_at column"}}`:
```diff
- {{removed lines from the diff — signature, field, or column only, not the full body}}
+ {{added lines}}
```

`{{ShortLabel 2 (if needed)}}`:
```diff
- {{...}}
+ {{...}}
```

---

**Review points**

#### {{Review point title — name the concern precisely, e.g. "Upsert atomicity"}}
{{1–2 sentences: why this matters and what to verify.}}

```python
# Optional snippet — include only when the code pattern is the point (5–10 lines max)
```

> **Suggestion:** {{Concrete recommendation with rationale. Reference a specific pattern, library, PostgreSQL feature, or language idiom. Skip this block entirely if the implementation is correct.}}

---

#### {{Review point 2 title}}
{{...}}

```python
# snippet (optional)
```

> **Suggestion:** {{optional}}

---

<!-- Aim for 2–4 review points per feature. Remove unused blocks. -->

**Files**
```
{{path/to/file-one.py}}
{{path/to/file-two.py}}
```

---

### Feature 2: {{FEATURE_NAME}} · `{{RISK_LEVEL}}` risk

**What it does**
{{...}}

**Interface changes**

<!-- Remove if none -->

`{{ShortLabel}}`:
```diff
- {{...}}
+ {{...}}
```

---

**Review points**

#### {{Review point title}}
{{...}}

---

**Files**
```
{{path/to/file-three.py}}
```

---

<!-- Add more feature blocks as needed. Remove unused ones. -->

---

### Supporting / housekeeping · `low` risk

<!-- Only include for files with no feature: lockfile bumps, changelogs, CI tweaks. Remove if not needed. -->

**Files**
```
{{path/to/lockfile}}
{{CHANGELOG.md}}
```

No review action needed beyond a quick sanity check.

---

## Cross-cutting concerns

### Missing co-changes
<!-- List each absent expected companion from Step 3d. Format: trigger → expected companion → why it matters.
     If all companions are present, write the single line below and remove the bullets. -->

{{Either: "No missing co-changes identified."}}

{{Or, one bullet per gap:}}
- **{{Trigger}}** (`{{file or pattern}}`): expected `{{companion file or change}}` — {{one sentence on why the gap matters, e.g. "without a migration, the new column does not exist in production until a manual ALTER TABLE is run"}}

### Test coverage
{{Which changed source modules have no corresponding test changes? Name the files. If all modules have coverage, write "All changed modules have corresponding test changes."}}

### Rollback risk
{{Anything hard to undo: schema migrations, data backfills, external API contract changes, config flag removals, column renames. If none, write "No rollback concerns identified."}}

### Suggested review order
{{Only for large PRs (> 20 files or > 5000 lines). List feature names from lowest to highest risk. Remove for normal PRs.}}

---

<!--
TEMPLATE RULES — remove this block before posting:
- Interface changes: diff blocks only, no prose description of the change.
- Review points lead each feature block; file paths close it.
- Snippets and Suggestion blocks are optional — include only when they add value.
- Missing co-changes: list only absent ones; skip not-applicable.
- Remove all placeholder comments and unused sections before posting.
-->