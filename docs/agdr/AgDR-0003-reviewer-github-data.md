---
id: AgDR-0003
timestamp: 2026-10-12T00:00:00Z
agent: pi
trigger: user-prompt
status: executed
---

# Read-only GitHub data for reviewers

> In the context of PR review, facing missing Copilot comments and CI evidence, I decided to expose fixed GitHub read operations to reviewers to retrieve current remote evidence, accepting that comments and CI state can change independently of the pinned diff.

## Context
- Reviewers already use authenticated gh for pinned PR snapshots.
- They must remain read-only and cannot receive unrestricted bash or write-capable parent tools.

## Options Considered
| Option | Pros | Cons |
|--------|------|------|
| Parent tool proxy | Reuses configured integrations | Parent tools may permit GitHub writes or shell execution |
| Fixed gh read tool | Explicit read-only boundary; supports comments and CI | Maintains a small operation list |

## Decision
Chosen: fixed gh reads, because reviewers need remote evidence without acquiring mutation capabilities. Include a fixed GraphQL query for review-thread resolution, REST pagination for comments and CI, and bounded excerpts for logs.

## Consequences
- Uses the user's gh authentication; authentication errors remain visible.
- Remote evidence is live, not part of the pinned source snapshot.
- No arbitrary queries, shell commands, posting, resolving threads, or workflow reruns.

## Artifacts
- pi-extensions/extensions/mini-agents/github.ts
- pi-extensions/extensions/mini-agents/index.ts
