---
id: AgDR-0002
timestamp: 2026-10-11T13:08:32Z
agent: codex
model: unknown
trigger: user-prompt
status: executed
---

# Retry account archiving without repeating OAuth

> In the context of a completed Codex OAuth authorization, facing a failed write of the previous account, I decided to offer retry or cancellation before returning the new credential to Pi, accepting another dialog when storage fails, to preserve both the previous login and the user's completed authorization during retry.

## Context

- Native Pi persists the returned OAuth credential in the core slot, replacing the previous account.
- Silently swallowing an archive error would discard the previous account's only saved credential. Archiving cannot be deferred until the next sign-in after replacement.
- Pi's UI-neutral auth interaction supports selection and cancellation; credential persistence stays in ModelRuntime.

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| Ignore archive failure and return the new login | No extra interaction | Overwrites the only saved previous login; cannot retry archiving it later |
| Keep fail-closed behavior with a clearer error | Small change, preserves previous login | Requires repeating browser/device approval even after a temporary failure |
| Offer retry or cancellation with the new credential held in memory | Preserves previous login; retry reuses completed OAuth | Requires interactive choice; cancellation still discards the unpersisted authorization |

## Decision

Choose retry or cancellation because saving the previous login is necessary for account preservation, while a transient failure should not require another browser flow. Do not add an option that silently replaces the previous account without archiving it.

## Consequences

- Attempt archiving through Pi's locked runtime. On failure, explain that authorization completed but the new login is not saved yet.
- Retry archiving only, re-reading the current core credential to avoid reusing an outdated token. Honor cancellation before every attempt and after the prompt.
- Keep the pending credential in memory only; never log it or write it to metadata.
- Contain legacy-selection recovery failures separately so quota polling still starts, with at most one warning per session.

## Artifacts

- pi-extensions/extensions/codex-accounts/accounts.ts
- pi-extensions/extensions/codex-accounts/index.ts
- pi-extensions/extensions/codex-accounts/tests/accounts.test.mjs
