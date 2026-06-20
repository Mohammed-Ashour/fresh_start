# Repository Rules

## Git commit messages

When generating commit messages:
- Use Conventional Commits format.
- Prefer: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `build`, `style`.
- Keep the subject line concise, imperative, and ideally under 72 characters.
- Use a scope when helpful, e.g. `feat(zed): ...`.
- Return a single-line subject unless a body is explicitly requested.
- Focus on the user-visible or maintenance-relevant change, not implementation trivia.

Examples:
- `feat(zed): add standalone Zed install category`
- `fix(permission-gate): tighten destructive command filters`
- `chore(pi-extensions): switch web search to pi-web-access`
