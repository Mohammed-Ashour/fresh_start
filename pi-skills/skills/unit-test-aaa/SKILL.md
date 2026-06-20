---
name: unit-test-aaa
description: Write or update Python unit tests using pytest with the Arrange-Act-Assert (AAA) pattern, covering happy and sad paths, including Pydantic validation behavior, and mirroring the src/ module structure under tests/. Use when adding or editing unit tests in Python projects, especially when strong typing and validation need coverage.
---

# Unit Test AAA

## Overview
Create real, maintainable pytest unit tests that follow AAA, cover both happy and sad paths, validate Pydantic models/validators, and mirror the src/ directory structure in tests/.

## Workflow

1. Locate source modules and existing tests.
   - Mirror `src/...` paths under `tests/...` (e.g., `src/pkg/foo.py` → `tests/unit/test_pkg/test_foo.py`).
   - Reuse existing test conventions in the repository.

2. Design coverage with minimal repetition.
   - Cover both happy path (valid inputs) and sad path (invalid inputs, edge cases).
   - Use pytest parametrization and fixtures to avoid repetitive setup.

3. Write tests in AAA format.
   - **Arrange**: build inputs/fixtures, set up mocks if needed.
   - **Act**: call the unit under test.
   - **Assert**: verify outputs, side effects, and exceptions.
   - Use inline `# Arrange`, `# Act`, `# Assert` comments when helpful to make AAA explicit.

4. Validate Pydantic models.
   - Include tests that exercise validation/validators (e.g., `ValidationError` cases).
   - Check field-level validation errors for expected fields/messages where stable.
   - Prefer `model_dump()`/`model_validate()` APIs consistent with Pydantic v2.

5. Keep tests real (not faked).
   - Avoid asserting on behavior that the implementation does not provide.
   - Prefer realistic inputs that match actual usage.

6. Handle long-running tests with markers.
   - If a test is slow (network, large data, heavy computation), mark it with a pytest marker.
   - If no marker exists, ask the user which marker to use or whether to add one to the project config.

7. Summarize added tests after completion.
   - Provide a concise summary of new/updated tests and what they cover.
8. Run tests and validate results.
   - Run the relevant pytest subset for the added/updated tests.
   - If tests fail, identify whether the cause is test logic or implementation logic.
   - If the failure is due to tests, fix the tests and re-run.
   - If the failure is due to implementation logic, inform the user and propose a fix.

## Project Conventions (apply when writing tests here)

- Python 3.13+.
- Use pytest.
- Follow Ruff formatting and linting; line length 120; 4-space indent; double quotes.
- Type annotations required for functions and methods.
- Google-style docstrings for test classes/functions when present in repo.
- Prefer `pathlib.Path` over string paths.
- Use logging, not print.
- Avoid global mutable state.
- Avoid imports inside functions unless necessary.

## Output Expectations

- Tests mirror `src/` structure under `tests/`.
- Tests follow AAA and cover happy/sad scenarios.
- Pydantic models include validation tests.
- Minimal repetition via fixtures/parametrization.
- Summary of added/updated tests provided at the end of the task.
- Tests executed and results reviewed; failures handled per workflow.
