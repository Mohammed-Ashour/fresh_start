---
name: deep-module-reviewer
description: review software code and architecture for shallow modules and recommend refactors toward deep modules. use when asked to review current code, repositories, pasted code, uploaded source files, or pull requests for module depth, interface complexity, information hiding, abstraction leakage, pass-through layers, classitis, unnecessary wrappers, or refactoring opportunities based on john ousterhout's a philosophy of software design.
---

# Deep Module Reviewer

## Purpose

Review code through the deep-module lens from John Ousterhout's *A Philosophy of Software Design*: prefer modules that hide substantial implementation complexity behind simple, stable interfaces. Identify shallow modules whose interface cost is high relative to the functionality they provide, then recommend refactors that deepen abstractions and reduce system complexity.

Use this skill for code review, architecture review, PR review, refactoring planning, and design critique. Work with GitHub repositories, uploaded files, pasted code, or PR diffs.

## Core principle

Treat every module as two parts:

- **Interface**: the visible surface other code must learn, call, configure, mock, or depend on.
- **Implementation**: the hidden functionality, decisions, algorithms, state, coordination, and edge-case handling behind the interface.

A deep module gives high benefit for low interface cost. A shallow module exposes a relatively complex interface while hiding little functionality.

Read `references/deep-module-principles.md` when the task needs the conceptual rubric, scoring details, or review heuristics.

## Review workflow

1. **Establish review scope**
   - For GitHub, inspect the requested repository, files, PR, or issue context before judging design.
   - For uploaded or pasted code, infer the module boundaries from files, public APIs, classes, functions, packages, services, and CLI/API entrypoints.
   - If the codebase is large, sample public interfaces first, then follow call sites into implementations.
   - If the scope is defined by the user, review the specified modules and their immediate dependencies, but also look for related shallow patterns in nearby code.

2. **Map module boundaries**
   - Identify the externally visible interfaces: exported functions, public classes/methods, route handlers, service APIs, config objects, event schemas, command names, database-facing repositories, and shared utility functions.
   - Note the implementation hidden behind each interface: validation, orchestration, algorithms, state transitions, persistence, error handling, retries, concurrency, caching, external service calls, and domain rules.

3. **Classify module depth**
   - Mark a module as **deep** when a small, coherent interface hides meaningful complexity or policy.
   - Mark a module as **shallow** when the interface mostly repeats the implementation, delegates without adding abstraction, splits one idea across many names, or forces callers to know internal sequencing and details.
   - Avoid assuming “small” is bad. A small helper can be fine if private and clarifying. The concern is public or widely reused shallow abstractions that increase dependency surface.

4. **Look for shallow-module signals**
   - Pass-through methods or classes that only forward parameters.
   - Wrappers that rename an operation without hiding policy or complexity.
   - Public helpers with one-line bodies and names that reveal the body.
   - Many small classes/functions that callers must compose in a fixed order.
   - Configuration objects with many knobs that expose implementation choices.
   - APIs where callers must understand caching, persistence, retries, batching, ordering, or lifecycle details.
   - Temporal decomposition, such as `initialize`, `validate`, `prepare`, `execute`, `cleanup` as separate public steps when the sequence is mandatory.
   - Information leakage, such as data structures, storage layout, protocol quirks, external API limitations, or error taxonomies exposed unnecessarily.
   - Same abstraction repeated across layers with different names but no new policy.

5. **Recommend deep-module refactors**
   Prefer recommendations that reduce interface cost while increasing hidden implementation value:
   - Collapse pass-through layers when they do not create a different abstraction.
   - Move sequencing, validation, retry, batching, caching, and error translation behind one stable operation.
   - Replace parameter clusters and boolean flags with intention-revealing operations or cohesive request objects.
   - Merge micro-classes that represent one concept and have no independent lifecycle.
   - Split only when the split hides a distinct design decision or creates a different abstraction level.
   - Make implementation helpers private unless callers need the abstraction directly.
   - Redesign APIs around caller intent, not internal steps.
   - Hide unstable external dependencies behind domain-level interfaces.
   - Convert temporal decomposition into object or function boundaries that own the whole lifecycle.

6. **Check tradeoffs before recommending changes**
   - Do not blindly merge modules. Preserve boundaries needed for security, ownership, deployment, testing, performance, independent scaling, public API compatibility, or domain separation.
   - Call out when a shallow module is acceptable because it isolates a third-party dependency, supports test seams, maintains backwards compatibility, or keeps generated/framework code contained.
   - Prefer incremental refactors that reduce call-site churn and preserve behavior.

## Output format

Default to a concise but actionable review report:

```markdown
# Deep module review

## Executive summary
[2-5 bullets: most important design findings and the highest-leverage refactors.]

## Module depth map
| Module / interface | Depth assessment | Evidence | Risk |
|---|---:|---|---|
| [name] | deep / mixed / shallow | [specific code evidence] | [complexity impact] |

## Shallow module findings
### 1. [Finding title]
- **Where:** [file, class, function, route, or symbol]
- **Signal:** [pass-through wrapper, temporal decomposition, parameter leakage, etc.]
- **Why it is shallow:** [interface cost vs hidden functionality]
- **Impact:** [maintenance, caller complexity, duplicated sequencing, fragile dependencies]
- **Recommended refactor:** [specific change]
- **Sketch:** [optional before/after pseudocode]

## Ranked refactoring backlog
| Priority | Refactor | Expected depth gain | Risk / migration notes |
|---:|---|---|---|
| P0/P1/P2 | [specific action] | [what complexity becomes hidden] | [compatibility/testing notes] |

## Keep as-is
[Boundaries that look shallow but should stay because they serve a valid purpose.]

## Open questions
[Only questions that block a confident recommendation.]
```

For PR-style reviews, adapt the same content into inline comments, but still include a ranked backlog at the end.

## Evidence rules

- Cite concrete symbols, files, call chains, public method counts, parameter lists, or call-site examples whenever possible.
- Distinguish confirmed findings from hypotheses.
- Do not claim a module is shallow solely because it is short. Explain what interface cost it imposes and what complexity it fails to hide.
- Do not reward generic “manager”, “service”, or “helper” wrappers unless they create a simpler caller-facing abstraction.
- Prefer recommendations that remove concepts from callers’ mental model.

## Scoring rubric

Use this lightweight score when a ranked backlog is useful:

- **Interface cost**: number and complexity of public operations, parameters, flags, configuration, ordering rules, error modes, and concepts callers must understand.
- **Hidden complexity**: amount of implementation detail, domain policy, lifecycle handling, edge cases, or external-system behavior hidden behind the interface.
- **Leakage**: degree to which callers must know storage, protocol, sequencing, retries, caching, or internal data structures.
- **Change leverage**: how many call sites, future features, or known bugs would benefit from a deeper boundary.
- **Migration risk**: API compatibility, behavior preservation, ownership, tests, and rollout cost.

Prioritize findings with high interface cost, low hidden complexity, high leakage, and high change leverage.
