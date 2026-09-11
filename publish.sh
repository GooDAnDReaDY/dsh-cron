#!/usr/bin/env bash
# publish.sh — публикационный слой GitHub (ADR-0003).
#
# Публичное дерево собирается из проверенного main без служебных файлов
# (AGENTS.md, index.md, планы, ADR, дизайн-контракт, deploy.sh, служебные
# каталоги). Список исключений описан в .gitattributes; здесь тот же список
# применяется git-пламбингом, поэтому дерево воспроизводимо и файлы никуда не
# копируются.
#
# Режимы:
#   bash publish.sh plan [ref]
#       Показать состав будущего публичного дерева и проверить, что в нём нет
#       служебных файлов и есть обязательные продуктовые. Ничего не меняет.
#
#   DSH_CRON_PUBLISH=yes bash publish.sh publish <ref> <version>
#       Создать публикационный коммит поверх текущего публичного main GitHub,
#       показать состав, запушить ветку main и тег v<version>. Force-режимы не
#       используются: коммит — обычный потомок публичного main, поэтому push
#       fast-forward. Расхождение SHA с Gitea main зафиксировано в ADR-0003.
#
# Скрипт не входит в npm-пакет и не трогает production.

set -euo pipefail

MODE="${1:-}"
REF="${2:-origin/main}"
VERSION="${3:-}"

GITHUB_URL="https://github.com/GooDAnDReaDY/dsh-cron.git"
GITHUB_BRANCH="main"

# Служебные пути: то же, что export-ignore в .gitattributes.
EXCLUDED_PATHS=(
  "AGENTS.md"
  "index.md"
  "deploy.sh"
  "publish.sh"
  "docs/plans"
  "docs/adr"
  "docs/design"
  ".planning"
  ".worktrees"
)

# Файлы, без которых публикация бессмысленна.
REQUIRED_PATHS=(
  "package.json"
  "lib/index.js"
  "lib/client.js"
  "cordis.patch.yml"
  "README.md"
  "LICENSE"
)

fail() { echo "ERROR: $*" >&2; exit 1; }

# Собирает дерево из REF без служебных путей и печатает объект дерева.
build_public_tree() {
  local ref="$1"
  local index_file
  index_file="$(mktemp)"
  rm -f "$index_file"
  export GIT_INDEX_FILE="$index_file"

  git read-tree "$ref" || fail "cannot read the tree of $ref"
  local path
  for path in "${EXCLUDED_PATHS[@]}"; do
    git rm --cached -r -q --ignore-unmatch "$path" >/dev/null 2>&1 || true
  done
  local tree
  tree="$(git write-tree)" || fail "cannot write the public tree"
  unset GIT_INDEX_FILE
  rm -f "$index_file"
  printf '%s' "$tree"
}

verify_tree() {
  local tree="$1"
  local list
  list="$(git ls-tree -r --name-only "$tree")"

  local path
  for path in "${EXCLUDED_PATHS[@]}"; do
    if printf '%s\n' "$list" | grep -qx "$path" || printf '%s\n' "$list" | grep -q "^$path/"; then
      fail "excluded path is present in the public tree: $path"
    fi
  done
  for path in "${REQUIRED_PATHS[@]}"; do
    printf '%s\n' "$list" | grep -qx "$path" || fail "required file is missing from the public tree: $path"
  done

  printf '%s\n' "$list" | sort
}

case "$MODE" in
  plan)
    tree="$(build_public_tree "$REF")"
    echo "public tree for $REF (object $tree):"
    verify_tree "$tree" >/dev/null
    git ls-tree -r --name-only "$tree" | sort
    echo "plan: OK — no service files, all required product files present"
    ;;

  publish)
    [ "${DSH_CRON_PUBLISH:-}" = "yes" ] || fail "publication requires explicit owner approval: run with DSH_CRON_PUBLISH=yes"
    [ -n "$VERSION" ] || fail "usage: DSH_CRON_PUBLISH=yes bash publish.sh publish <ref> <version>"
    command -v gh >/dev/null 2>&1 || fail "gh CLI not found in PATH (needed for the GitHub credential helper)"

    tree="$(build_public_tree "$REF")"
    echo "public tree for $REF (object $tree):"
    verify_tree "$tree" >/dev/null
    git ls-tree -r --name-only "$tree" | sort
    echo "verification: no service files, all required product files present"

    # Parent must be the current public main so the push is a fast-forward.
    git -c credential.helper='!gh auth git-credential' fetch "$GITHUB_URL" "$GITHUB_BRANCH" >/dev/null 2>&1 \
      || fail "cannot read the current public $GITHUB_BRANCH from GitHub"
    public_main="$(git rev-parse FETCH_HEAD)"
    echo "public $GITHUB_BRANCH is $public_main"

    commit="$(git commit-tree "$tree" -p "$public_main" -m "release: publish v$VERSION

Public tree for v$VERSION: the product files from the verified main without
the internal documents (AGENTS.md, index.md, plans, ADRs, design contract,
deploy.sh). The SHA differs from Gitea main on purpose — see ADR-0003.")"
    echo "publication commit $commit"

    git -c credential.helper='!gh auth git-credential' push "$GITHUB_URL" "$commit:refs/heads/$GITHUB_BRANCH" \
      || fail "push of the publication commit failed"
    git tag -a "v$VERSION" "$commit" -m "v$VERSION — public release tree"
    git -c credential.helper='!gh auth git-credential' push "$GITHUB_URL" "refs/tags/v$VERSION" \
      || fail "push of the release tag failed"
    echo "published: $GITHUB_URL branch $GITHUB_BRANCH and tag v$VERSION -> $commit"
    ;;

  *)
    fail "usage: bash publish.sh plan [ref] | DSH_CRON_PUBLISH=yes bash publish.sh publish <ref> <version>"
    ;;
esac
