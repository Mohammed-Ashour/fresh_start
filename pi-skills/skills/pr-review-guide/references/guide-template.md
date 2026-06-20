# reviewer guide template

Use this structure unless the PR is tiny:

## PR review guide

### What this PR does
One short paragraph. State the practical purpose of the PR in plain language.

### Features and clusters
For each feature or review surface, include:
- cluster name
- why it exists
- files involved
- where to focus
- risk level: high, medium, or low

### High-risk areas
List changes that deserve careful review. Examples: auth, permissions, migrations, API contracts, background jobs, billing, infra, concurrency.

### Low-risk or skimmable areas
Call out generated files, snapshots, lockfiles, mechanical renames, or repetitive tests.

### Suggested review path
Give a sensible order for reading the PR.

### File list
Group files by feature or review surface, not alphabetically.

## Style rules
- Keep the prose compact and concrete.
- Use straight quotes.
- Do not use em dashes.
- Do not oversell the PR.
- Prefer short sentences.
- Mention uncertainty when clustering is inferred from filenames alone.
