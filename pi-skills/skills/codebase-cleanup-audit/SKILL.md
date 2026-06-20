---
name: codebase-cleanup-audit
description: Perform repository-wide cleanup audits to identify dead code, unused imports, unreachable blocks, duplicate logic, commented-out code, unused dependencies/files/exports, and obsolete feature flags or config keys. Use when asked to reduce maintenance burden, prepare deletion candidates, or produce a confidence-scored cleanup report without modifying behavior. Execute this skill as a plain-text workflow using shell commands and manual verification, not a bundled analyzer script.
---

# Codebase Cleanup Audit

## Overview

Run a deterministic, read-only cleanup audit and produce a confidence-scored report ordered HIGH, MEDIUM, LOW. Use direct shell commands plus manual verification. Do not rely on any bundled analyzer script.

## Workflow

1. Confirm scope and manifests.
- Identify dependency manifests first (`pyproject.toml`, `package.json`, `requirements*.txt`, `Cargo.toml`) and source roots.
- Use:
```bash
rg --files -g 'pyproject.toml' -g 'package.json' -g 'requirements*.txt' -g 'Cargo.toml'
```

2. Gather category evidence with plain-text commands.
- Unused imports and obvious unreachable patterns:
```bash
RUFF_NO_CACHE=1 ruff check src tests scripts main.py --no-cache --select F401,F841,RET505,RET506,RET507,RET508 --output-format concise
```
- Dead code candidates (definitions with no obvious references):
```bash
rg -n '^(def|class) ' src
```
- Commented-out code blocks:
```bash
rg -n '^\s*#\s*(def|class|if|for|while|try|except|with|return|import|from)\b' src
```
- Duplicate logic candidates:
```bash
rg -n 'def _register_commands_once|def _ensure_registered|def main' src/hydrosat/hywater/cli
```
- Dependency usage map (Python repos):
```bash
rg -n '^(from|import) ' src tests scripts
```
- Unused files/exports/flags:
```bash
rg -n '__all__|ENABLE|DISABLE|FEATURE|FLAG|TOGGLE' src
```

3. Verify high-confidence items manually.
- Spot-check each HIGH finding with fast search (`rg`) before finalizing.
- Downgrade confidence when dynamic loading is possible (pytest discovery, Alembic migrations, logging formatter string paths, plugin/entrypoint systems, side-effect imports).
- Keep behavior-preserving bias: report candidates, do not delete automatically.

4. Present the report contract.
- Start with HIGH confidence findings.
- For every finding provide:
  1. File path and line number(s)
  2. What it is and why it appears safe to remove
  3. Confidence level (`HIGH`, `MEDIUM`, `LOW`)

## Categories Covered

Audit all of the following categories:
1. Dead code
2. Unused imports
3. Unreachable code
4. Duplicate logic
5. Commented-out code
6. Unused dependencies
7. Unused files
8. Unused exports
9. Obsolete feature flags/config keys

## Constraints

- Treat static analysis as candidate generation, not proof of deletion safety.
- Downgrade confidence when dynamic imports, reflection, plugin systems, or framework registration are possible.
- Do not perform removals in the same step unless explicitly requested.

## References

- Confidence guidance: `references/confidence-rubric.md`
