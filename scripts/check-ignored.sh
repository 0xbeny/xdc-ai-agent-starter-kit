#!/usr/bin/env bash
# Fails if any file under source directories is excluded by .gitignore (guards against over-broad rules).
set -euo pipefail
cd "$(dirname "$0")/.."
bad=$(git ls-files --others --ignored --exclude-standard -- apps packages templates scripts docs deploy \
  | grep -vE '(^|/)(node_modules|\.next|\.mastra|dist|coverage|__pycache__)(/|$)|next-env\.d\.ts$|\.tsbuildinfo$|\.DS_Store$' || true)
if [ -n "$bad" ]; then
  echo "✗ source files are git-ignored:"; echo "$bad" | sed 's/^/    /'; exit 1
fi
echo "✓ no source files are git-ignored"
