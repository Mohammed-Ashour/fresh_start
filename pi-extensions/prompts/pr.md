---
description: Push the current branch and open a pull request
argument-hint: "[base branch]"
---
Open a pull request for the current branch against `${1:-main}`.

1. Check `git status` and the current branch. If it is the base branch, or there are uncommitted changes, stop and tell me instead of guessing.
2. Read `git log --oneline ${1:-main}..HEAD` and `git diff --stat ${1:-main}...HEAD` to understand the whole change, not just the last commit.
3. Push with `git push -u origin HEAD`. Never force-push.
4. Create the PR with `gh pr create --base ${1:-main}`:
   - Title: Conventional Commits style, under 72 characters.
   - Body: a short summary of why, a bullet list of the main changes, and how it was tested (commands run and results). Mention anything risky or left for follow-up. Keep it brief; no headings for one-line sections.
5. Print the PR URL.
