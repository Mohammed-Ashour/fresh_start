# Observability and recovery policy

- Emit identifiers, state transitions, error context, and operator next steps for important execution paths.
- Prefer signals tied to real failure modes over generic activity or uptime metrics.
- Define retry exhaustion, dead-letter or quarantine behavior, partial-output cleanup, and replay procedures where applicable.
- Preserve rollback, restore, reprocessing, or safe forward-fix paths appropriate to the system.
- Treat undocumented recovery as unverified, not automatically absent.
- Do not add logs, metrics, or alerts without a clear operational question they answer.
