#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── Branch selection ───────────────────────────────

echo ""
echo "TouchLock — Store Package Builder"
echo "=================================="
echo ""

# Get all local branches
BRANCHES=()
while IFS= read -r b; do
  BRANCHES+=("$b")
done < <(git branch --format='%(refname:short)')

if [ ${#BRANCHES[@]} -eq 0 ]; then
  echo "Error: No branches found."
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)

echo "Available branches:"
echo ""
i=1
for b in "${BRANCHES[@]}"; do
  MARKER=""
  if [ "$b" = "$CURRENT_BRANCH" ]; then
    MARKER=" ← current"
  fi
  printf "  %d) %s%s\n" "$i" "$b" "$MARKER"
  i=$((i + 1))
done

COUNT=${#BRANCHES[@]}
echo ""
read -rp "Select branch to build [1-${COUNT}]: " CHOICE

if ! echo "$CHOICE" | grep -qE '^[0-9]+$' || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt "$COUNT" ]; then
  echo "Error: Invalid selection."
  exit 1
fi

SELECTED_BRANCH="${BRANCHES[$((CHOICE - 1))]}"

echo ""
echo "Building from branch: $SELECTED_BRANCH"

# ── Switch to selected branch ──────────────────────

SWITCHED=false
if [[ "$SELECTED_BRANCH" != "$CURRENT_BRANCH" ]]; then
  # Stash any uncommitted changes
  STASHED=false
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    echo "  Stashing uncommitted changes..."
    git stash push -m "build-zips auto-stash" > /dev/null 2>&1
    STASHED=true
  fi

  git checkout "$SELECTED_BRANCH" > /dev/null 2>&1
  SWITCHED=true
  echo "  Checked out: $SELECTED_BRANCH"
fi

# ── Read version from the selected branch ──────────

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
CONFIG_FILE="src/scripts/config.js"
FIREFOX_CONFIG_FILE="firefox/src/scripts/config.js"

rm -f "$REPO_ROOT"/touchlock-for-*.zip

echo ""
echo "TouchLock v${VERSION} — Building store packages"
echo "================================================"

# ── Chrome ─────────────────────────────────────────
echo ""
echo "[1/3] Chrome Web Store ..."
echo "const TOUCHLOCK_STORE = 'chrome';" > "$CONFIG_FILE"

CHROME_ZIP="$REPO_ROOT/touchlock-for-chrome-${VERSION}.zip"
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

EDGE_ZIP="$REPO_ROOT/touchlock-for-edge-${VERSION}.zip"
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

FIREFOX_ZIP="$REPO_ROOT/touchlock-for-firefox-${VERSION}.zip"
cd "$REPO_ROOT/firefox"
zip -r "$FIREFOX_ZIP" \
  manifest.json \
  icons/icon-16.png icons/icon-48.png icons/icon-128.png \
  src/ \
  -x "*.DS_Store" > /dev/null

cd "$REPO_ROOT"
echo "  → $FIREFOX_ZIP ($(du -h "$FIREFOX_ZIP" | cut -f1))"

# ── Restore original branch ───────────────────────

if [[ "$SWITCHED" == true ]]; then
  git checkout "$CURRENT_BRANCH" > /dev/null 2>&1
  echo ""
  echo "Restored branch: $CURRENT_BRANCH"

  if [[ "${STASHED:-false}" == true ]]; then
    git stash pop > /dev/null 2>&1
    echo "Restored stashed changes."
  fi
fi

# ── Done ───────────────────────────────────────────
echo ""
echo "================================================"
echo "Done! 3 zips built from branch '$SELECTED_BRANCH' (v${VERSION})"
echo ""
ls -lh "$REPO_ROOT"/touchlock-for-*.zip
