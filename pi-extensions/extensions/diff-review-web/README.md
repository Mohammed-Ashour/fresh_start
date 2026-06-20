# diff-review-web

Global pi extension for browser-based diff review.

## Commands

- `/diff-review-web` — open the current working tree diff in a browser
- `/diff-review-web --cached` — review staged changes
- `/diff-review-web main...HEAD` — review a custom diff range
- `/diff-review-web-stop` — stop the localhost review server

## Flow

1. Run `/diff-review-web` in pi.
2. A browser opens with a GitHub-style diff review page.
3. Add comments inline per changed line.
4. Click **End review**.
5. The extension loads the structured review notes back into the pi editor.
6. Return to pi and press Enter to send them.
