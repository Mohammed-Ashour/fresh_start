# Terraform policy

- Prefer plain resources when they express the current deployment clearly.
- Create modules for current repeated use, a dangerous boundary, ownership isolation, or an established reusable contract.
- Avoid modules that merely mirror provider schemas or pass every argument through.
- Inspect replacement, destroy, import, state move, lifecycle, dependency, and provider-version effects.
- Preserve least privilege and keep secrets out of configuration, logs, plans, state outputs, and ordinary outputs where possible.
- Make environment assumptions and state boundaries explicit.
- Provide rollback or safe forward-fix steps appropriate to the change.
- Verify with formatting, validation, and an inspected plan when backend access permits.
