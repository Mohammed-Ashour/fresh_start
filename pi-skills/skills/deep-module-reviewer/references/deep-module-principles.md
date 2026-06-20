# Deep Module Review Principles

## Source framework

Primary source: John Ousterhout, *A Philosophy of Software Design*, especially the discussion of deep modules, shallow modules, information hiding, and complexity.

Working model:

- A module is any unit with an interface and implementation: function, class, package, API endpoint, service, CLI command, job, or subsystem.
- Interface is the cost imposed on the rest of the system.
- Functionality and hidden implementation complexity are the benefit.
- Deep modules maximize benefit relative to interface cost.
- Shallow modules impose interface cost without hiding enough complexity.

## Diagnostic questions

Ask these questions while reviewing code:

1. What does a caller need to know before using this module correctly?
2. How many public names, parameters, flags, config values, lifecycle steps, error types, and ordering rules are exposed?
3. What design decisions does the module hide?
4. Could the implementation be replaced without changing callers?
5. Are callers forced to compose several shallow pieces in a mandatory sequence?
6. Does the interface describe caller intent or internal mechanics?
7. Is a lower-level data structure, external API, or protocol detail leaking through?
8. Does this layer introduce a new abstraction, or does it merely forward calls?
9. Would deleting this wrapper make the code easier to understand?
10. Would merging nearby modules hide more complexity behind fewer concepts?

## Common shallow-module patterns

### Pass-through layer
A class or function delegates almost all work to another module without simplifying the caller model or hiding a policy decision.

Refactor options:
- Delete the wrapper and call the underlying module directly.
- Move validation, sequencing, error translation, retries, caching, or policy into the wrapper so it becomes deep.
- Rename and reshape the wrapper around domain intent if it should be the stable boundary.

### Temporal decomposition
A workflow is split into public steps that must be called in order, such as `load`, `validate`, `prepare`, `run`, and `save`.

Refactor options:
- Create one public operation that owns the sequence.
- Make intermediate steps private.
- Return a durable result object rather than exposing lifecycle state.

### Parameter leakage
An interface exposes many flags, low-level configuration knobs, or data structures because internal implementation choices escaped into the API.

Refactor options:
- Replace flags with intention-revealing methods or named policy objects.
- Introduce a cohesive request object when the parameters represent a stable concept.
- Set defaults internally and expose only decisions the caller genuinely owns.

### Classitis or micro-abstractions
Many tiny classes/functions each have their own public interface, but callers must understand all of them to accomplish one task.

Refactor options:
- Merge modules around a single domain concept or lifecycle.
- Keep extraction private when it only helps local readability.
- Preserve separate modules only when they hide distinct design decisions or have independent reasons to change.

### Information leakage
Callers know storage schemas, external API quirks, batching rules, retry strategy, cache invalidation, locking, ordering, or internal error categories.

Refactor options:
- Translate external concepts into domain-level concepts at the boundary.
- Hide persistence and protocol details behind stable operations.
- Centralize retry, batching, caching, ordering, and error normalization.

### Same abstraction at adjacent layers
Two neighboring layers expose nearly the same methods, models, and vocabulary.

Refactor options:
- Collapse the layers.
- Give one layer a distinct responsibility, such as policy, orchestration, persistence, transport, or domain modeling.
- Move duplicated mapping or validation behind the higher-level interface.

## Signs of a deeper replacement

A recommended refactor is likely good when it:

- Reduces the number of public operations or concepts callers must learn.
- Converts mandatory call ordering into one safe operation.
- Moves edge cases into implementation code.
- Makes caller code shorter and more intention-revealing.
- Allows implementation changes without caller changes.
- Moves dependency-specific details to one place.
- Clarifies ownership of domain policy.

## Red flags in recommendations

Avoid these weak recommendations:

- “Make a smaller class” without explaining interface cost.
- “Add an abstraction” when the existing problem is already too many abstractions.
- “Use a design pattern” without showing what complexity it hides.
- “Extract method” for code that is private, readable, and not creating caller-facing complexity.
- “Merge everything” when boundaries protect ownership, security, deployment, testability, or compatibility.

## Severity guide

- **P0**: Shallow public interface is spreading across the codebase, causing duplicated sequencing, fragile call sites, or repeated policy bugs.
- **P1**: Shallow abstraction materially increases local complexity or blocks upcoming change, but migration is contained.
- **P2**: Minor shallow helper or wrapper that is mostly cosmetic, private, or low-risk.

## Review language

Use precise, code-grounded language:

- “This interface asks callers to know X, Y, and Z, but the implementation only forwards to A. It is shallow because it adds a concept without hiding complexity.”
- “This can become deeper by moving retry and error normalization behind `fetchCustomerProfile`, leaving callers with one domain-level operation.”
- “Keep this boundary despite shallow appearance because it isolates framework-generated code from domain code.”
