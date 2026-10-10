# Databases and migrations policy

- Make transaction boundaries, constraints, indexes, locks, table rewrites, and application-version compatibility explicit.
- Use expansion, backfill, validation, and contraction ordering for rolling deployments when required.
- Keep data migrations idempotent or explicitly one-shot with durable completion evidence.
- Account for retries, partial completion, concurrent application versions, and rollback or safe forward-fix behavior.
- Treat destructive DDL, silent truncation, incompatible schema changes, and unbounded lock duration as high-risk.
- Verify with schema checks, migration dry runs or staging runs, query plans, and representative compatibility tests as appropriate.
