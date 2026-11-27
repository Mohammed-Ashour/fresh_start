---
description: Commit the current changes with a Conventional Commits message
argument-hint: "[hint about scope or intent]"
---
Commit the current work in this repository.

1. Run `git status` and `git diff --staged`. If nothing is staged, look at the unstaged changes and stage the files that belong to one logical change. Leave unrelated files, generated output, and anything that looks like a secret or a session export unstaged, and say so.
2. Follow the repository's commit rules from AGENTS.md or CONTRIBUTING if they exist. Otherwise use Conventional Commits: `type(scope): subject`, imperative, under 72 characters, a single line, about the user-visible or maintenance-relevant change rather than implementation details.
3. Extra guidance from the user: ${@:-none}.
4. Run `git commit -m "<message>"` and show the resulting `git log --oneline -1`. Do not push and do not amend existing commits.
