# PR Review Rubric

Use this reference only when the PR requires deeper review. Keep findings tied to the actual diff and available surrounding code.

## Correctness

Check edge cases, input validation, error handling, concurrency, retries, idempotency, and failure modes. For numerical, geospatial, and scientific code, check CRS assumptions, units, array shapes, nodata semantics, dtype precision, bounds, interpolation behavior, random seeds, temporal alignment, and whether the algorithm matches the stated scientific intent.

## Architecture Impact

Ask whether the change makes the system easier or harder to reason about. Flag new coupling, hidden global state, duplicated responsibilities, unclear ownership, dependency direction violations, and changes that make future extension harder. Prefer recommendations that preserve simple interfaces and local reasoning.

## Deep vs Shallow Modules

Based on the design principle from *A Philosophy of Software Design*, a deep module has a simple interface while hiding meaningful complexity. A shallow module exposes an interface that is nearly as complex as its implementation.

Flag shallow modules or functions when they:

- Add pass-through layers that only rename or forward calls.
- Split logic into many tiny functions without hiding complexity.
- Expose implementation details through parameters, flags, return shapes, or configuration.
- Require callers to understand internal sequencing or invariants.
- Move complexity from implementation into the caller.

Recommend consolidating shallow abstractions, designing smaller interfaces, hiding policy or sequencing internally, or documenting the abstraction boundary.

## Database and Migration Review

Check backward and forward compatibility, deploy ordering, rollback path, nullability, defaults, locking, large table rewrites, index costs, query plan impact, data backfills, ORM or schema drift, and whether old and new app versions can run during rollout.

## API and CLI UX

Check naming consistency, discoverability, defaults, validation, error messages, auth or permission behavior, pagination, filtering, idempotency, exit codes, dangerous flags, documentation, and whether users can recover from mistakes.

## Test Effectiveness

Good tests prove behavior, not implementation details. Check that tests have meaningful assertions, cover edge cases and failure paths, isolate state, avoid excessive mocking, use clear fixtures, and include integration coverage when unit tests cannot validate behavior. Flag tests that only exercise code, mirror implementation, depend on order or time, or miss the changed risk surface.

## Performance and Data Engineering

For Python data pipelines, check memory pressure, chunking, vectorization, I/O patterns, serialization formats, retries, parallelism, deterministic ordering, schema evolution, and observability. For geospatial workloads, check raster/vector scale, tiling, reprojection cost, spatial indexing, coordinate precision, and boundary behavior.
