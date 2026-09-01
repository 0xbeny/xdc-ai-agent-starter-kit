#!/usr/bin/env bash
# Vendors the bundled skills from Nous Research's Hermes Agent (MIT) into templates/workspace/skills/.
# Re-run to refresh. Each skill keeps its own LICENSE; see templates/workspace/skills/ATTRIBUTION.md.
set -euo pipefail
cd "$(dirname "$0")/.."
REF=${HERMES_REF:-main}
DEST=templates/workspace/skills
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
echo "▸ fetching NousResearch/hermes-agent@$REF skills/ (sparse)"
git clone -q --depth 1 --filter=blob:none --sparse --branch "$REF" https://github.com/NousResearch/hermes-agent "$TMP/hermes"
git -C "$TMP/hermes" sparse-checkout set skills >/dev/null
SHA=$(git -C "$TMP/hermes" rev-parse --short HEAD)
mkdir -p "$DEST"
for cat in "$TMP/hermes/skills"/*/; do
  name=$(basename "$cat")
  [ "$name" = "index-cache" ] && continue
  rm -rf "$DEST/$name"
  cp -R "$cat" "$DEST/$name"
done
find "$DEST" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
count=$(find "$DEST" -name SKILL.md | wc -l | tr -d ' ')
cat > "$DEST/ATTRIBUTION.md" <<EOT
# Bundled skills

$count skills vendored from [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research (MIT),
commit \`$SHA\`, plus this kit's own skills. Each Hermes skill directory keeps its original LICENSE.
Skills follow the [agentskills.io](https://agentskills.io) SKILL.md format: the agent lists them on demand
(\`skills_list\`), reads one when needed (\`skill_view\`), and runs their scripts in the sandbox (\`run_command\`).

Refresh with \`bash scripts/import-hermes-skills.sh\`.
EOT
echo "▸ $count SKILL.md files under $DEST (hermes @ $SHA)"
