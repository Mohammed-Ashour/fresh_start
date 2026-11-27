#!/bin/bash
#
# pi-extensions/test.sh - run every extension's tests against the installed pi.
#
# Usage:
#   ./test.sh                 # all extensions
#   ./test.sh permission-gate # only the named extensions
#
# Also type-checks every extension when TypeScript is available: `tsc` on PATH,
# or TSC=/path/to/typescript/bin/tsc.

set -euo pipefail

SOURCE="$(cd "$(dirname "$0")" && pwd)/extensions"
command -v pi >/dev/null 2>&1 || { echo "pi is not on PATH" >&2; exit 1; }
export PI_BIN="${PI_BIN:-$(command -v pi)}"

if [[ $# -gt 0 ]]; then NAMES=("$@"); else NAMES=(); for dir in "$SOURCE"/*/tests; do NAMES+=("$(basename "$(dirname "$dir")")"); done; fi

FILES=()
for name in "${NAMES[@]}"; do
    found=false
    for file in "$SOURCE/$name"/tests/*.test.mjs; do [[ -e "$file" ]] && FILES+=("$file") && found=true; done
    [[ "$found" == true ]] || { echo "No tests for $name" >&2; exit 1; }
done

node --test "${FILES[@]}"

TSC="${TSC:-$(command -v tsc || true)}"
if [[ -z "$TSC" ]]; then
    echo "Skipping type check: no tsc on PATH (set TSC=/path/to/tsc)."
    exit 0
fi
host="$(dirname "$(realpath "$PI_BIN")")"
while [[ ! -f "$host/dist/index.d.ts" ]]; do
    [[ "$host" == / ]] && { echo "Cannot locate Pi's installed package" >&2; exit 1; }
    host="$(dirname "$host")"
done
modules="$host/node_modules"
config="$(mktemp -d)/tsconfig.json"
entries=()
for entry in "$SOURCE"/*.ts "$SOURCE"/*/index.ts; do [[ -e "$entry" ]] && entries+=("\"$entry\""); done
cat > "$config" <<JSON
{
  "compilerOptions": {
    "target": "es2023", "module": "nodenext", "moduleResolution": "nodenext", "strict": true, "noEmit": true,
    "skipLibCheck": true, "allowImportingTsExtensions": true, "types": ["node"], "typeRoots": ["$modules/@types"],
    "paths": {
      "@earendil-works/pi-coding-agent": ["$host/dist/index.d.ts"],
      "@earendil-works/pi-tui": ["$modules/@earendil-works/pi-tui/dist/index.d.ts"],
      "@earendil-works/pi-ai": ["$modules/@earendil-works/pi-ai/dist/index.d.ts"],
      "@earendil-works/pi-ai/providers/all": ["$modules/@earendil-works/pi-ai/dist/providers/all.d.ts"],
      "typebox": ["$modules/typebox"]
    }
  },
  "files": [$(IFS=,; echo "${entries[*]}")]
}
JSON
echo "Type-checking ${#entries[@]} extensions with $("$TSC" --version)"
"$TSC" -p "$config"
