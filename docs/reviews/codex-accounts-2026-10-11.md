# Codex accounts review

## Findings addressed

- [high] `pi-extensions/extensions/codex-accounts/accounts.ts:74`. The previous loader deleted the native credential and rewrote startup settings, breaking restored core-model selections. The replacement preserves a valid `openai-codex` slot and repairs a missing slot once through Pi's credential runtime. It never rewrites settings.
- [high] `pi-extensions/extensions/codex-accounts/accounts.ts:45` and `store.ts:103`. Direct auth-file updates raced native OAuth refresh and could overwrite unrelated credentials after parse failures. Credential writes now use public ModelRuntime operations and Pi's lock. Parse failures stop metadata writes instead of creating empty replacement data. Credential-save operations are serialized within the helper.
- [high] `pi-extensions/extensions/codex-accounts/accounts.ts:149`. A saved picker choice could still name the core slot after another native login moved that account into an archive. Removal now resolves the account's current slot by account ID before logout. A regression test proves a stale choice cannot delete the newer native login.
- [medium] `pi-extensions/extensions/codex-accounts/rotation.ts:15`. Account failover depended on agent retry classification and could misidentify generic JSON 429 responses as exhausted subscriptions. The wrapper checks original REST error codes, preserves native transient retries and callbacks, and visits each eligible account once only for proven quota failures before content. Partial output, tool calls, cancellation and auth failures are not replayed.
- [medium] `pi-extensions/extensions/codex-accounts/usage.ts:52`. Weekly exhaustion and expired/stale snapshots were not accounted for. Both windows now affect eligibility. Incomplete data stays unverified, and fresh quota recovery can clear a previously observed exhausted window without overwriting newer headers.
- [medium] `pi-extensions/extensions/codex-accounts/index.ts:262`. Account selection and default selection had overlapping semantics, long picker rows and unclear feedback. They now have separate actions, current/next/default markers, stable-ID Tab completion, compact footer text, quota-refresh progress and removal confirmation.
- [medium] `pi-extensions/extensions/codex-accounts/index.ts:286`. Pending polling and dialogs could outlive their session. Each session gets its own cancellation lifecycle; old reports do not post into a replacement session. Shutdown aborts sign-in/polling and clears timers.

## Verification

- 23 offline tests passed with temporary credentials and fake network responses.
- The integration test uses Pi's real extension loader, ModelRuntime, native Codex SSE adapter, virtual model routing and credential locking. It exercises quota failover, continuation, reload, generic throttling and transient retries.
- Credential tests cover core preservation, old migration repair, native/extension sign-in hooks, cancellation, duplicate removal, concurrent refresh, malformed storage and account removal/promotion.
- UX tests cover command completion, duplicate labels, remaining percentages, current/default/next roles, switching from another provider, cancelled removal, refresh progress and stale-report suppression.
- Strict TypeScript checking passed against the installed Pi 1.1.0 declarations. `git diff --check` passed.
- Tests did not send live prompts or change real credentials or startup settings.

## Follow-up regression fix

The user's successful quota lookup and native login still left a session selecting `codex-<accountId>/gpt-6.1-sol`. Prior tests routed catalog virtual models directly; they did not exercise a real AgentSession retaining an old physical selection or the cached-auth gate in `pi.setModel()`.

`pi-extensions/extensions/codex-accounts/index.ts` now repairs known account-specific physical and virtual selections on session startup/reload, model selection and input. It refreshes the full offline availability snapshot before setting the native model. A provider-only refresh raced background registration refreshes in the regression test and left `setModel()` returning false. Input recovery happens before auth preflight, unlike `before_agent_start`. The selected model ID and global settings stay unchanged.

The added regression failed before the fix and now passes using Pi's real AgentSession, loader, model runtime and temporary credentials. It tests resume, in-process reload, client model selection, an uncatalogued model ID and credentials saved after startup. Fake SSE responses confirm successful requests record `openai-codex` rather than the removed account credential provider. Real user credentials and session files were inspected only for credential-slot and model-selection metadata, not modified by these tests.

## Residual risks

- Live browser/device approval, terminal rendering, WebSocket quota failover, and cross-account continuations containing real encrypted reasoning or tool results still need interactive checks. The tested continuation uses ordinary assistant text.
- Concurrent login/logout in separate Pi processes spans multiple locked native operations and is unsupported. Native OAuth refresh itself uses Pi's cross-process lock.
- A revoked core token can fail native authentication before routing reaches another account. Reauthenticate with `/codex add` or native `/login`.
- Pi lists upgraded keyless virtual aliases as API-key placeholders even though they have no login method. Fresh installations register no legacy aliases. Use `/codex` or the single native Codex OAuth entry.
- A crash can leave the metadata-only lock directory behind. Remove it only after confirming no Pi process is using it. Native credential storage uses Pi's separate lock.

## Summary

The extension now shares native Codex authentication and preserves core model identities. Automated credential, routing and UX checks pass; live approval and multi-account reasoning/WebSocket checks are not claimed as verified.
