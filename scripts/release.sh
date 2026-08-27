#!/usr/bin/env bash
#
# Local release helper: validate -> bump version -> push tag.
# GitHub Actions (".github/workflows/release.yml") does the rest:
# tests, npm publish, and GitHub Release creation.
#
# Usage:
#   ./scripts/release.sh [major|minor|patch]   # default: patch
#
set -euo pipefail
cd "$(dirname "$0")/.."

TYPE="${1:-patch}"
case "$TYPE" in
  major|minor|patch) ;;
  *) echo "Usage: ./scripts/release.sh [major|minor|patch]"; exit 1 ;;
esac

# 1. Working tree must be clean
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Working tree is not clean. Commit or stash first."
  exit 1
fi

# 2. Local main must be in sync with origin/main
git fetch origin --quiet
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "✗ Must run on branch 'main' (current: $BRANCH)"
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "✗ Local main is not in sync with origin/main. Pull/push first."
  exit 1
fi

# 3. Quick sanity checks
for f in $(git ls-files '*.js'); do node --check "$f"; done
node cli.js --version > /dev/null
echo "✓ Sanity checks passed"

# 4. Bump version (package.json only) and cut the release commit + tag
npm version "$TYPE" --no-git-tag-version > /dev/null
NEW_VERSION=$(node -p "require('./package.json').version")

git add package.json
git commit --quiet -m "chore(release): v${NEW_VERSION}"
git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION}"

# 5. Push commit + tag; CI publishes from here
git push origin main --follow-tags --quiet

echo "✓ v${NEW_VERSION} pushed."
echo "  GitHub Actions is now testing, publishing to npm, and creating the GitHub release."
echo "  Watch it: gh run watch --exit-status $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')"
