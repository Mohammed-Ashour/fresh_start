# Kubernetes policy

- Use standard Kubernetes primitives before operators, sidecars, service meshes, or additional templating layers.
- Define resources, workload identity, secret references, shutdown behavior, restart behavior, rollout behavior, and scheduling assumptions for production workloads.
- Use startup, readiness, and liveness probes when they represent meaningful health semantics. Otherwise document the reason for omission.
- Check disruption, termination grace, volume behavior, permissions, selectors, immutable fields, and rollout deadlocks.
- Keep service accounts and RBAC least-privileged.
- Validate rendered manifests rather than templates alone when practical.
- Ensure logs and workload identifiers are sufficient to diagnose a failed rollout or job.
