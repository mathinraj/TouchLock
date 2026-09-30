#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
DIST_DIR="$REPO_ROOT/dist"
CONFIG_FILE="src/scripts/config.js"
FIREFOX_CONFIG_FILE="firefox/src/scripts/config.js"

mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR"/touchlock-*.zip

echo "TouchLock v${VERSION} — Building store packages"
echo "================================================"

# ── Chrome ─────────────────────────────────────────
echo ""
echo "[1/3] Chrome Web Store ..."
echo "const TOUCHLOCK_STORE = 'chrome';" > "$CONFIG_FILE"

CHROME_ZIP="$DIST_DIR/touchlock-for-chrome-${VERSION}.zip"
zip -r "$CHROME_ZIP" \
  manifest.json \
  icons/icon-16.png icons/icon-48.png icons/icon-128.png \
  src/ \
  -x "*.DS_Store" > /dev/null

echo "  → $CHROME_ZIP ($(du -h "$CHROME_ZIP" | cut -f1))"

# ── Edge ───────────────────────────────────────────
echo ""
echo "[2/3] Edge Add-ons ..."
echo "const TOUCHLOCK_STORE = 'edge';" > "$CONFIG_FILE"

EDGE_ZIP="$DIST_DIR/touchlock-for-edge-${VERSION}.zip"
zip -r "$EDGE_ZIP" \
  manifest.json \
  icons/icon-16.png icons/icon-48.png icons/icon-128.png \
  src/ \
  -x "*.DS_Store" > /dev/null

echo "  → $EDGE_ZIP ($(du -h "$EDGE_ZIP" | cut -f1))"

# Reset Chrome config back to default
echo "const TOUCHLOCK_STORE = 'chrome';" > "$CONFIG_FILE"

# ── Firefox ────────────────────────────────────────
echo ""
echo "[3/3] Firefox Add-ons ..."
echo "const TOUCHLOCK_STORE = 'firefox';" > "$FIREFOX_CONFIG_FILE"

FIREFOX_ZIP="$DIST_DIR/touchlock-for-firefox-${VERSION}.zip"
cd "$REPO_ROOT/firefox"
zip -r "$FIREFOX_ZIP" \
  manifest.json \
  icons/icon-16.png icons/icon-48.png icons/icon-128.png \
  src/ \
  -x "*.DS_Store" > /dev/null

cd "$REPO_ROOT"
echo "  → $FIREFOX_ZIP ($(du -h "$FIREFOX_ZIP" | cut -f1))"

# ── Done ───────────────────────────────────────────
echo ""
echo "================================================"
echo "Done! All 3 zips are in $DIST_DIR/"
echo ""
ls -lh "$DIST_DIR"/touchlock-*.zip
