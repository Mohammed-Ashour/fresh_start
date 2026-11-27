# Permission Gate

Checks every `bash`, `write`, `edit`, `read`, `grep`, `find`, and `ls` call (including calls made from codemode scripts) before it runs.

## Modes

| Mode | Behaviour |
|---|---|
| `plan` | Read-only commands only; `write`/`edit` limited to `.md` files |
| `default` | Asks before every write, edit, and command that is not read-only |
| `acceptEdits` | Allows writes and edits; asks before commands that are not read-only |
| `safeMode` (default) | Allows normal work; asks only for risky actions |
| `bypassPermissions` | Never asks |

`fullAuto` from older configs is treated as `safeMode`. `Ctrl+Shift+P` cycles through every mode except bypass, which you can only pick with `/permissions`.

## What happens in every mode

**Blocked** (no prompt; the model is told to stop and let you run it with `!cmd`):
- deleting `/`, `~`, system folders, top-level user folders (`~/Documents`, …), or everything inside them
- formatting or writing disks, `shutdown`/`reboot`, `kill -1`, fork bombs
- reading or writing secret paths: `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/gh`, `~/.netrc`, `~/.npmrc`, `~/.kube/config`, keychains, `~/.pi/agent/auth.json`, `~/.pi/agent/codex-accounts.json`, … Any spelling counts (`$HOME/...`, relative paths, symlinks, different capitalisation on macOS) and so does any tool (`read`, `grep`, `bash`, `python -c`).

**Asks in safe mode** (blocked when there is no interactive UI):
- force or deleting pushes (`--force`, `--force-with-lease`, `+ref`, `:ref`)
- `git reset --hard`, `checkout -- path`, `restore`, `clean -f`, `switch --discard-changes`, but **only when those paths have uncommitted changes**
- `git branch -D`, `stash drop/clear`, history rewrites
- recursive deletes outside the project or temp folders, deleting the project root or `.git`, deletes whose target depends on variables
- running a downloaded script (`curl … | sh`, `bash <(curl …)`)
- writes to shell startup files, `~/.gitconfig`, LaunchAgents, `~/.pi/agent` config, this gate itself, or `<project>/.pi`
- publishing (`npm publish`, `cargo publish`, …), `terraform destroy`/`apply -auto-approve`, `kubectl delete`, cloud `delete` commands, destructive SQL, Docker volume removal, `sudo`

**Never asks in safe mode:** builds, tests, installs, edits, `rm -rf node_modules dist`, `find . -delete`, plain `git push`, commits with `$(...)` or backticks in the message, `docker exec`, `source .venv/bin/activate`, `curl … | jq`.

When a prompt appears, **Allow "<rule>" for this session** stops that kind of prompt for the rest of the session.

## Commands

- `/permissions [mode]`: show or change the mode
- `/permissions-explain <command>`: show how a command is classified and why
- `/permissions-settings`: show config sources, paths, and rules
- `/permissions:status`: mode and session allowances
- `/sandbox [on|off]`: toggle the sandbox (when enabled in config)

## Configuration

Copy `permissions.example.json` to `~/.pi/agent/permissions.json`. Every key is optional and adds to the built-in defaults:

| Key | Meaning |
|---|---|
| `mode` | Starting mode |
| `sandbox` | Run bash inside a macOS Seatbelt sandbox (see below) |
| `extraSecretPaths` | More paths to block completely |
| `extraWriteProtectedPaths` | More paths whose writes ask first |
| `extraReadOnlyCommands` | Commands that skip prompts in `plan`/`default` modes |
| `askPatterns` / `blockPatterns` | `{ "pattern": "<regex>", "description": "…" }` matched against the raw command |
| `disabledRules` | Ask-level rule ids to stop asking about, e.g. `["git-force-push"]`. Blocks cannot be disabled. |

A **trusted** project can add `.pi/permissions.json`. It can only tighten: a stricter mode, more protected paths, more patterns, or turning the sandbox on. It cannot lower the mode or disable rules. Untrusted projects' files are ignored.

The old `~/.pi/agent/extensions/permissions.json` is still read for `mode` if the new file is missing. `setup.sh` copies the mode across and moves the old files to `~/.pi/agent/backups/`.

## Sandbox

With `"sandbox": true`, bash commands run under `sandbox-exec`. They can write only to the project, temp folders, and package-manager caches. They cannot read secret paths or write protected paths. This holds even for code the rules cannot see into, such as Python scripts or Makefiles. Network access is unchanged. Anything that writes elsewhere, such as `brew install` or global npm installs, fails inside the sandbox; use `/sandbox off` or run it yourself with `!cmd`.

## Tests

```bash
node --test pi-extensions/extensions/permission-gate/tests/*.test.mjs
```

`policy.test.mjs` covers the classifier and sandbox profile. `extension.test.mjs` loads the extension with Pi's module loader and checks the prompts, modes, project config, and sandboxed bash tool.
