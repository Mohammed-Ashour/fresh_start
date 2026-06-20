#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: post_pr_comment.sh <pr-number> <markdown-file>" >&2
  exit 2
fi

PR_NUMBER="$1"
MARKDOWN_FILE="$2"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh is not installed" >&2
  exit 3
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "gh is not authenticated" >&2
  exit 4
fi

if [ ! -f "$MARKDOWN_FILE" ]; then
  echo "markdown file not found: $MARKDOWN_FILE" >&2
  exit 5
fi

gh pr comment "$PR_NUMBER" --body-file "$MARKDOWN_FILE"
