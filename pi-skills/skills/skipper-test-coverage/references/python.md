# Python policy

- Prefer functions for stateless behavior.
- Use classes for real state, lifecycle, polymorphism, an established protocol, or repeated current behavior.
- Keep I/O, state changes, credentials, paths, and external calls visible in names and control flow.
- Preserve public signatures, typing contracts, and exception behavior unless the requirement changes them.
- Avoid broad exception handling, swallowed context, mutable defaults, implicit global state, and unclear resource ownership.
- Handle empty input, invalid input, partial results, cancellation, and external failures at the relevant boundary.
- Prefer the standard library or an approved existing dependency before adding a package.
- Remove one-use abstractions when they obscure behavior or add maintenance cost, but retain genuine external boundaries and established interfaces.
- Use focused tests or the smallest appropriate verification for changed behavior.
