# Codex accounts

Use several ChatGPT accounts with Pi's normal Codex models. Select a default account, rotate when quota runs out, and see **remaining** quota and reset times.

Requires Pi 1.1.0's native provider and ModelRuntime APIs. Tested on Node 22.

## Start here

```bash
./pi-extensions/setup.sh codex-accounts
```

Run `/reload` in Pi. Use `/codex` to sign in or add accounts. Browser and device-code authentication use Pi's built-in OpenAI OAuth implementation. Select a normal `openai-codex` model through `/model`; no special routing model is required.

`/login` → **Codex (ChatGPT accounts)** calls the same sign-in flow. It preserves the previous account when you sign into a different one. You can use `/codex` exclusively, but normal Pi login still works.

## Commands

| Command | Action |
|---|---|
| `/codex` | Account menu; first-time use opens sign-in directly |
| `/codex add` | Start sign-in directly |
| `/codex use [account]` | Switch this session and select a normal Codex model automatically |
| `/codex default [account]` | Set the default for new sessions, without switching this session |
| `/codex remove [account]` | Sign out with confirmation and a warning if this is your last account |
| `/codex help` | Show command shortcuts |
| `/codex cancel` | Cancel extension-initiated sign-in |
| `/codex-usage` or `/codex usage` | Refresh and show every account's remaining quota and reset times |

The picker marks current, next and default accounts. Tab completes commands and saved accounts. An account argument can be an email, full account ID or unique ID prefix; omit it to open the picker. Duplicate emails have distinct ID labels.

The default is the first choice in a new session. An explicit switch applies to the next Codex request. After failover, the session stays on the account that answered until you switch it or it runs out of quota.

Both the short window and weekly window count toward exhaustion. The footer shows remaining percentages, absolute reset times, and the number of accounts with recently confirmed quota. A passed reset requires a fresh usage check; unknown or stale data is never shown as confirmed ready. TUI sessions refresh all accounts at most once a minute; explicit quota commands bypass that interval.

## Core compatibility and storage

- The current native login stays in `auth.json` under `openai-codex`. Disabling the extension leaves that login usable.
- Previous accounts live under private `codex-account-<accountId>` credential slots. Only the helper runtime sees those providers; they do not create OAuth entries in `/login`.
- Pi's public ModelRuntime methods own credential writes, logout and locked OAuth refresh. The extension reads `auth.json` but never writes it directly.
- `codex-accounts.json` holds the default, account order, quota snapshots and reset bookkeeping. It contains no tokens and uses mode `0600`.
- Startup settings are never rewritten. Upgrades retain old `codex-multi/auto` and `codex-<accountId>/<model>` selections as virtual compatibility aliases. Fresh installs do not create them. Pi may list upgraded keyless aliases as API-key placeholders; they are not sign-in methods. Use the single Codex OAuth entry or `/codex`.
- Restored account-specific selections automatically move to `openai-codex` on startup, reload or model selection. The next input also repairs a stale selection after native `/login`, before Pi checks request authentication. Recovery preserves the selected model ID, refreshes Pi's auth availability snapshot and does not rewrite startup settings. Registered virtual aliases alone do not repair an old physical model object.
- A one-time repair restores a missing `openai-codex` credential left by the previous extension. It copies through Pi's credential runtime, then removes the duplicate legacy slot. A valid core credential is never replaced during repair.
- `/codex` removal promotes a remaining account if you remove the core account. Native `/logout` signs out the core slot normally; use `/codex` removal to manage all saved accounts.

## Failover and limits

Each request tries each eligible account at most once. Only a recognized ChatGPT usage-limit error **before any content streams** triggers failover. Partial text, thinking, tool calls, cancellation, authentication failures and generic HTTP 429s are not replayed. If all accounts are exhausted, the request reports an error and `/codex-usage` shows reset times.

The chosen model, prompt, tool context and request hooks stay the same across accounts. Native transient retries remain enabled; raw HTTP error codes distinguish quota exhaustion from generic 429 throttling. Unsupported models report the backend error rather than silently changing models. Usage comes from response headers and the ChatGPT usage endpoint, which also covers responses sent over WebSockets.

Sign in while idle. Simultaneous login/logout in different Pi processes is not supported; credential changes span separate locked Pi operations. Sharing copied refresh tokens with the Codex CLI can invalidate either login, so CLI-token import is intentionally absent. Sign in directly instead.

A revoked native core token can fail Pi's authentication before account routing runs. Sign in again through `/codex` or `/login`. Usage endpoint failures retain cached values and mark them unavailable. If Pi crashes while holding the metadata lock, remove `codex-accounts.json.lock` only after confirming no Pi process is using it. Native credentials are separate from that lock.

## Tests

With Pi installed globally:

```bash
node --test pi-extensions/extensions/codex-accounts/tests/*.test.mjs
```

For a non-global installation, set `PI_PACKAGE_DIR` to the installed coding-agent package directory. Tests use temporary credentials and fake network responses. They exercise Pi's real credential locks, extension loader, native Codex SSE adapter, quota failover, continuation, reload and legacy routing. A real AgentSession regression test covers restored physical and virtual selections, uncatalogued model IDs and input after native sign-in. Live browser/device approval and WebSocket failover still need interactive verification.
