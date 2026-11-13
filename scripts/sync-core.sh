#!/usr/bin/env bash
# Vendors core/ into the phone app at src/core/, each file stamped with a header that
# names the source and the sha256 of the body. The app's `npm run check-core` verifies it.
#   scripts/sync-core.sh [path/to/sumry-app]   (default: $SUMRY_APP or ~/src/sumry-app)
set -euo pipefail

src="$(cd "$(dirname "$0")/.." && pwd)/core"
app="${1:-${SUMRY_APP:-$HOME/src/sumry-app}}"
dest="$app/src/core"

[ -d "$src" ] || { echo "no core/ at $src" >&2; exit 1; }
[ -f "$app/package.json" ] || { echo "no app at $app" >&2; exit 1; }

mkdir -p "$dest"
find "$dest" -maxdepth 1 -type f -name '*.ts' -delete

count=0
for f in "$src"/*.ts; do
  case "$f" in *.test.ts) continue ;; esac
  hash=$(sha256sum "$f" | cut -d' ' -f1)
  {
    printf '// generated - edit in sumry/web core/ and run scripts/sync-core.sh. sha256:%s\n' "$hash"
    cat "$f"
  } > "$dest/$(basename "$f")"
  count=$((count + 1))
done

echo "synced $count files into $dest"
