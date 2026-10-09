# Data pipelines and contracts policy

- Define input and output schemas, partition or idempotency keys, overwrite rules, manifests, lineage, and output versions where relevant.
- Handle duplicate, late, missing, partial, and out-of-order inputs according to the current contract.
- Publish outputs atomically or provide equivalent commit semantics.
- Clean up or quarantine failed attempts without deleting valid prior outputs.
- Keep run, source item, dataset, partition or AOI, output, and attempt identifiers available where operators need them.
- Preserve backward compatibility or explicitly version contract changes.
- Verify retry, replay, backfill, and partial-failure behavior, not only the successful path.
