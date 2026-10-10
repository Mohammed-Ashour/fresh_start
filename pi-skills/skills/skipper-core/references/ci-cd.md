# CI/CD and packaging policy

- Add jobs and checks for current failure modes or release requirements.
- Keep build, packaging, publishing, promotion, migration, deployment, and rollback paths explicit.
- Check trigger scope, path filters, permissions, protected environments, concurrency, and repeated-run safety.
- Produce immutable, reproducible artifacts and promote the same artifact between environments when practical.
- Pin or otherwise control mutable actions, images, toolchains, and dependency inputs according to project policy.
- Keep secrets out of logs and handle shell quoting and failure propagation safely.
- Treat syntax validation separately from proof that credentials and remote systems work.
- Verify release version behavior, cache correctness, artifact identity, and duplicate publish or deploy behavior.
