#!/usr/bin/env bash
# Excludes internal infrastructure such as ".gitea", AGENTS.md, etc. by delegating to scripts/publish-github.sh
# publish.sh — публикационный слой GitHub (ADR-0003).
# Делегирует единому каноническому builder scripts/publish-github.sh (#246).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-}"
REF="${2:-origin/main}"
VERSION="${3:-}"

case "$MODE" in
  plan)
    exec bash "$SCRIPT_DIR/scripts/publish-github.sh" --check "$REF"
    ;;
  publish)
    [ "${DSH_CRON_PUBLISH:-}" = "yes" ] || { echo "ERROR: publication requires DSH_CRON_PUBLISH=yes" >&2; exit 1; }
    [ -n "$VERSION" ] || { echo "ERROR: usage: DSH_CRON_PUBLISH=yes bash publish.sh publish <ref> <version>" >&2; exit 1; }
    bash "$SCRIPT_DIR/scripts/publish-github.sh" --push "$REF"
    if [ -n "$VERSION" ]; then
      git -c credential.helper='!gh auth git-credential' push "https://github.com/GooDAnDReaDY/dsh-cron.git" "refs/tags/v$VERSION" || true
    fi
    ;;
  *)
    echo "usage: bash publish.sh plan [ref] | DSH_CRON_PUBLISH=yes bash publish.sh publish <ref> <version>" >&2
    exit 1
    ;;
esac
