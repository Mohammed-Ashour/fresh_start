# Fresh macOS setup architecture

## Purpose

Install a macOS development environment and distribute Pi skills and extensions from this repository.

## Scope and Assumptions

Verified on 2026-10-11 against `README.md`, installer entry points, and the Codex accounts extension. This document describes installer boundaries and the Codex subsystem; it does not audit every bundled extension. Mini-agents boundaries were verified on 2026-10-26. Codex integration targets Pi 1.1.0 and Node 22. No `src/` directory or `pyproject.toml` was found; entry points are Bash scripts and Pi extension factories.

## System Overview

`init_macos.sh` delegates Pi resource installation to category scripts. `pi-extensions/setup.sh` copies selected files/directories into the agent directory and records hashes to avoid overwriting local edits. Pi later loads an extension's `index.ts`. The Codex extension overrides the native `openai-codex` provider while keeping its OAuth flow and model catalog.

## Architecture Diagram

```mermaid
flowchart TD
    Init[init_macos.sh] --> Installer[pi-extensions/setup.sh]
    Installer --> Installed[Installed extension directory]
    Installed --> Index[codex-accounts/index.ts]
    Index --> UI[ui.ts: dialogs, commands, formatting]
    Index --> Rotation[rotation.ts: bounded request failover]
    Index --> Accounts[accounts.ts: account lifecycle]
    Rotation --> Accounts
    Accounts --> Native[Pi ModelRuntime and native OAuth]
    Native --> Auth[auth.json: credentials]
    Accounts --> Store[store.ts: metadata and credential discovery]
    Index --> Usage[usage.ts: quota endpoint and headers]
    Rotation --> Usage
    UI --> Usage
    Store --> Metadata[codex-accounts.json: no tokens]
```

## Runtime Entry Points

- `init_macos.sh`: setup categories and dry-run handling.
- `pi-extensions/setup.sh`: extension installer, source descriptions in `pi-extensions/manifest.tsv`.
- `pi-skills/setup.sh`: skill installer.
- `pi-extensions/extensions/codex-accounts/index.ts`: asynchronous Pi extension factory, `/codex` and `/codex-usage`, session lifecycle events.
- `pi-extensions/extensions/codex-accounts/tests/`: Node test runner fixtures. Network responses and OAuth approval are fake; credentials use temporary directories.

## Architectural Layers

- Installer scripts depend on `lib/installer-ui.sh` for selection and confirmation.
- `index.ts` registers the provider and coordinates commands, quota polling, lifecycle cleanup and recovery of account-specific model selections. Recovery refreshes the native auth availability snapshot and moves the selection to `openai-codex` without changing the model ID.
- `accounts.ts` depends on Pi's public credential runtime and native provider. It owns account archiving, removal, defaults and one-time repair.
- `rotation.ts` depends on `accounts.ts` and quota parsing. It wraps native event streams without changing the selected model or transcript.
- `store.ts` reads credentials, discovers account identities and writes metadata only. It imports Pi credential types but does not own OAuth.
- `usage.ts` parses quotas, calculates availability and fetches the usage endpoint. It depends on store types.
- `ui.ts` formats picker rows, footer text, reports and command completions. It depends on store types and quota calculations, not network or credential writes.

### Background mini-agents

`pi-extensions/extensions/mini-agents/index.ts` registers one `/mini-agents` command and one model-only `mini_agents` management tool. Both create the same session-local agent records with stable IDs, names, purposes, capability options, state, questions, and report paths. Separate reviewer/researcher/implementer types and per-role model defaults are replaced by read-only defaults and optional parent tools, web access, pinned PR snapshots, model selection and conversation context. Enabled skills are captured from the parent command or pre-run event; children discover repository instructions through Pi's resource loader.

Each agent captures its launch cwd, branch and commit. Resource discovery, tool paths and GitHub resolution use the launch directory, including after queued startup. Writable children reject parent executors from another directory. Optional PR snapshots and fixed authenticated GitHub reads remain in `pi-extensions/extensions/mini-agents/github.ts`. Snapshot source reads are pinned; comments, reviews, thread status, checks and Actions evidence are live and paginated. Optional web access loads installed pi-web-access. These fixed read-only helpers execute locally in the child.

Read-only children expose explicit file/evidence tools and a cancellable `ask_user`. Writable children additionally proxy the parent's callable tools through `ExtensionToolContext.executeTool`, retaining live validation, permission checks and result hooks. An optional tool-name allowlist limits these proxies. Hidden/model-only tools are excluded, including the management tool, so children cannot recursively delegate through it. Writable children inherit the parent's effective system instructions and settings. Missing executors fail closed. Tool restrictions are not an OS sandbox.

Model-created agents capture the checked executor directly from the management call. Manual writable starts require confirmation and obtain it through a queued call to that same tool using a one-use token. Pending startup is visible, cancellable and expires after one minute. Only one writer can be active, including queued startup and question waiting. All writers share the checkout with the parent, without isolation, branch locking or rollback.

Active agents share an above-editor progress widget. Peek uses a non-focus-taking panel or an explicit scrollable overlay, including for completed agents. Both user commands and model tool actions can list, inspect, message and stop agents. Messages answer pending questions, queue behind current work, or resume a completed conversation. Completed child sessions remain in memory until stopped or parent shutdown; failed/stopped children cannot resume. Reports and bounded logs persist per agent. Results and questions enter the parent conversation without triggering a model turn. Every execution has a 30-minute timeout including question waiting. Shutdown closes children and pending questions, invalidates startup tokens, clears UI/timers and suppresses cross-session messages. Live records are not restored after reload.

## External Integrations

- Pi's mapped `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` entry points provide provider registration, ModelRuntime, OAuth and event streams.
- The native OpenAI OAuth implementation owns browser/device sign-in and refresh.
- Native Codex streaming owns SSE/WebSocket transport and transcript conversion.
- `https://chatgpt.com/backend-api/wham/usage` supplies remaining quota inputs and reset timestamps. Access requires the selected account's refreshed token and account ID.

## Core Data Flow (Current)

1. Loading discovers existing credentials and metadata. A one-time repair restores a missing core credential through Pi's locked operations. It does not replace a valid core credential or rewrite settings. Session startup, reload and model selection repair known account-specific model selections. An input handler also repairs them after native login, before Pi's auth preflight. Virtual alias registration alone cannot guarantee that an old physical model object is replaced.
2. `/login` and `/codex add` use the same native OAuth method. A different previous account moves into a private credential slot before Pi replaces the core login. If archiving fails after approval, a retry/cancel dialog retains the pending credential in memory. Retrying reuses that approval and re-reads the previous credential; cancellation does not replace the previous core login. The newly signed-in account remains in `openai-codex` after successful persistence.
3. A request selects the session preference, current account or default, skipping known exhaustion in either quota window. Unknown quota remains eligible but is not counted as confirmed ready.
4. Native OAuth refresh runs through Pi's credential store lock. The stream wrapper supplies the chosen account token while preserving model, transcript and callbacks.
5. A proven quota error before content tries another account. Partial text, thinking, tool calls, authentication errors, cancellation and generic throttling do not trigger account replay. Normal transient retries stay native.
6. Header snapshots and bounded usage polling update metadata. TUI polling covers all accounts. Session replacement aborts the previous lifecycle so old dialogs and reports cannot affect the new session. Shutdown also aborts extension-initiated sign-in and clears the timer.

## Module Ownership Boundaries

Pi owns `auth.json` writes, locking and OAuth refresh. The extension owns `codex-accounts.json`, with a separate metadata-only lock and restrictive file permissions. The native core slot remains usable when the extension is disabled. Archived providers belong to the helper runtime and never register another OAuth login in the main runtime. Only upgraded installations retain legacy virtual aliases.

Setting a default changes future sessions. Switching changes this session and selects a normal Codex model when needed. UI notifications and quota display failures must not abort native requests. Recovery contains storage/registry failures and warns once per session so startup still arms quota polling. Native request callback failures remain visible to callers. Archiving is a credential-preservation requirement, not optional metadata; failures require retry or cancellation rather than silent account replacement.

## Architecture Change Protocol

Document changes to provider identity, credential ownership or failover semantics in this architecture document. Keep native credential operations separate from metadata writes. Run the offline suite before installation and verify that normal Codex auth still works without the extension. Installer overwrite rules remain independent of authentication behavior.

## Future Clarifications

- Live browser/device approval, terminal rendering and WebSocket failover still require interactive verification.
- Concurrent login/logout across Pi processes spans separate native transactions and is unsupported. A revoked core token can fail native authentication before routing; reauthentication is required.
- Pi 1.1.0 lists keyless virtual providers as API-key placeholders. Legacy aliases provide no login method; use the native Codex OAuth entry or `/codex`.
- A process crash can leave the metadata lock directory behind. Remove it only after checking no Pi process is using it. This lock never protects native credentials.
- Model availability varies by ChatGPT plan. Unsupported models report the backend error rather than silently changing the chosen model.
