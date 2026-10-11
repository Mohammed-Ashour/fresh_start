---
id: AgDR-0001
timestamp: 2026-10-11T04:52:16Z
agent: codex
model: unknown
trigger: user-prompt
status: executed
---

# Integrate account rotation with Pi's Codex provider

> In the context of multi-account Codex access, facing broken core authentication from competing provider identities, I decided to extend the existing openai-codex provider and reuse Pi's OAuth and credential operations to keep ordinary login and model selections working, accepting a dependency on Pi's native provider and ModelRuntime APIs.

## Context
- The initial extension deletes the core credential and rewrites settings during loading.
- Separate account-provider logins leave restored sessions pointed at an unauthenticated core provider.
- Direct auth.json writes bypass Pi's cross-process refresh lock.
- Codex quota errors are not always retried by the agent.

## Options Considered
| Option | Pros | Cons |
|--------|------|------|
| Repair separate providers and virtual routing | Less streaming code | Multiple login identities and account/model confusion remain |
| Integrate with openai-codex | One native login, unchanged model identity, request-local failover | Needs a stream wrapper and compatibility handling |
| Patch Pi core | Full control of credential storage | Requires maintaining a fork |

## Decision
Chosen: **Integrate with openai-codex**, because Pi's provider extension API can preserve the existing OAuth method and model catalog while adding account selection and bounded failover.

## Consequences
- Keep the core credential intact. Archive previous accounts only when signing into a different account.
- Use public ModelRuntime login, logout, and getAuth operations for locked credential writes and refreshes.
- Restore a missing core credential once for installations damaged by the first extension version. Do not rewrite settings.
- Keep old codex-multi/auto and codex-* session selections as virtual compatibility aliases on upgrades only. Fresh installs expose only native Codex models. Pi currently lists keyless virtual providers as nonfunctional API-key placeholders; they never register an additional OAuth flow.
- Try each alternate account at most once, only for quota errors before any content has been emitted. Inspect original REST error codes because Pi 1.1.0's adapter labels generic JSON 429s as usage limits. Preserve native transient retries and request hooks.
- Reuse Pi's native OAuth flow; remove the copied OAuth implementation.
- Add offline regression tests and isolated Pi integration tests without sending user prompts or exposing tokens.

- Keep the UI on native Pi dialogs. Separate session switching from the default for new sessions, expose Tab-completed shortcuts, and show current/next/default markers with remaining quota.
- Cross-process concurrent login/logout remains unsupported because archiving and core replacement require separate public credential operations.

## Artifacts
- pi-extensions/extensions/codex-accounts/
- pi-extensions/extensions/codex-accounts/tests/
- ARCHITECTURE.md
