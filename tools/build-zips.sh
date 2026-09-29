#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Read version from the root manifest
VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
FIREFOX_VERSION=$(python3 -c "import json; print(json.load(open('firefox/manifest.json'))['version'])")

if [ "$VERSION" != "$FIREFOX_VERSION" ]; then
  echo "WARNING: Chrome manifest version ($VERSION) differs from Firefox manifest version ($FIREFOX_VERSION)"
  echo "Using each manifest's own version for the zip filename."
fi

# Clean any previously built zip files
rm -f "$REPO_ROOT"/touchlock-*.zip

CHROME_ZIP="$REPO_ROOT/touchlock-for-chrome-${VERSION}.zip"
FIREFOX_ZIP="$REPO_ROOT/touchlock-for-firefox-${FIREFOX_VERSION}.zip"

# ── Chrome ──────────────────────────────────────────────────────────────────────
echo "Packaging Chrome extension v${VERSION} ..."
zip -r "$CHROME_ZIP" \
  manifest.json \
  icons/icon-16.png \
  icons/icon-48.png \
  icons/icon-128.png \
  src/ \
  -x "*.DS_Store"

echo "  → $CHROME_ZIP ($(du -h "$CHROME_ZIP" | cut -f1))"

# ── Firefox ─────────────────────────────────────────────────────────────────────
echo "Packaging Firefox extension v${FIREFOX_VERSION} ..."
cd "$REPO_ROOT/firefox"
zip -r "$FIREFOX_ZIP" \
  manifest.json \
  icons/icon-16.png \
  icons/icon-48.png \
  icons/icon-128.png \
  src/ \
  -x "*.DS_Store"

echo "  → $FIREFOX_ZIP ($(du -h "$FIREFOX_ZIP" | cut -f1))"

cd "$REPO_ROOT"
echo ""
echo "Done. Zips are in $REPO_ROOT/"
ls -lh "$REPO_ROOT"/touchlock-*.zip
