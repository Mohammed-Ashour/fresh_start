---
name: architecture-context
description: Generate or update ARCHITECTURE.md with repository-grounded constraints. Use when starting tasks that touch core modules, add new components, or change subsystem connections. Read ARCHITECTURE.md first; if missing, read README.md and docs/. Produce a structured architecture document from verified code evidence, summarize task-relevant components before proposing changes, and update ARCHITECTURE.md after structural changes.
---

# Architecture Context

## Workflow

1. Locate architecture sources.
- Read `ARCHITECTURE.md` at the project root when present.
- If `ARCHITECTURE.md` does not exist, read `README.md` and relevant files under `docs/`.

2. Collect repository evidence before writing architecture claims.
- Verify code layout under `src/`.
- Verify runtime entry points from `pyproject.toml` (`[project.scripts]`).
- Verify supporting modules (for example `db/`, `comms/`, `providers/`, `telemetry/`, `utils/`, `dags/`, `readers/`) by checking paths that actually exist.
- Verify architecture docs referenced in the output exist (for example `docs/*`).

3. Summarize task-relevant architecture context before proposing changes.
- List only components, boundaries, and integration points that affect the current task.
- Call out cross-component impact when interfaces, ownership, or dependency direction changes.

4. Generate or update `ARCHITECTURE.md` using the required structure.
- Keep section order and headings stable unless the user explicitly requests a redesign.
- Use concise, evidence-backed statements.

5. After structural changes, update `ARCHITECTURE.md` in the same change set.
- Update only affected sections when possible.
- Preserve unrelated content and heading stability.

## Required Constraints

- Do not invent modules, packages, entry points, dependencies, integrations, or data flows.
- Mention a file path only if it exists in the repository.
- If evidence is missing, write `Unknown (not found in scanned sources)` instead of guessing.
- Mark temporal context explicitly with an absolute date in `Scope and Assumptions`.
- Keep dependency direction explicit and consistent across sections.
- Prefer repository-relative paths in documentation.

## Required `ARCHITECTURE.md` Structure

Use this section order when generating a new file:

1. `# <Project Name> Architecture`
2. `## Purpose`
3. `## Scope and Assumptions`
4. `## System Overview`
5. `## Architecture Diagram` (Mermaid)
6. `## Runtime Entry Points`
7. `## Architectural Layers`
8. `## External Integrations`
9. `## Core Data Flow (Current)`
10. `## Module Ownership Boundaries`
11. `## Architecture Change Protocol`
12. `## Future Clarifications`

For updates to an existing file:
- Preserve existing heading names/order unless the current file is clearly inconsistent or user asks for restructuring.
- Modify only sections impacted by the implemented structural change.
- Keep unchanged sections semantically intact.

## Generation Checklist

Before finalizing output:
- Confirm every referenced path exists.
- Confirm CLI/runtime entry points match `pyproject.toml`.
- Confirm boundary statements align with actual package layout.
- Confirm architecture claims are backed by scanned sources.
- Confirm whether `ARCHITECTURE.md` was updated and note which sections changed.

## Output Requirements

Always provide:
- Source used: existing `ARCHITECTURE.md` or fallback (`README.md` + `docs/`).
- A short task-relevant architecture summary before change proposals.
- A concise list of changed `ARCHITECTURE.md` sections (or `No changes`).
