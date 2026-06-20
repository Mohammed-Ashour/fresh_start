# Confidence Rubric

Use this rubric when reviewing and presenting findings from `cleanup_audit.py`.

## HIGH

Use HIGH only when static analysis strongly guarantees removability:
- Unused `from x import y` symbol in the same module
- Code after `return`/`raise`/`break`/`continue` in the same block
- Unreferenced private symbol (for example `_helper`) with no decorators
- Large commented-out code blocks
- Boolean feature/config flag defined but never referenced

## MEDIUM

Use MEDIUM when findings are likely but could be intentionally retained:
- Unused plain `import x` (possible side-effect import)
- Public unreferenced symbols
- Duplicate function bodies
- Dependencies not matched to import roots
- Files not in static import graph
- Exports not consumed internally
- Constant-condition branches (`if True` / `if False`)

## LOW

Use LOW for dynamic or reflection-heavy code paths where static confidence is weak.

## Manual Verification Checklist

Before removing anything, verify:
1. Runtime plugin loading or dynamic imports (`importlib`, entry points, framework discovery)
2. Public API compatibility expectations for packages
3. External consumers (scripts, notebooks, Airflow, CI jobs) outside this repo
4. Side-effect imports used for registration
