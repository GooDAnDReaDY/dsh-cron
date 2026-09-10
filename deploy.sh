#!/usr/bin/env bash
# deploy.sh — единая штатная точка deploy-подготовки и установки @goodandready/dsh-cron.
#
# Режимы:
#   bash deploy.sh check
#       Проверка ветки: тесты, состав пакета (лимит 256 KiB на файл DSH Store),
#       сборка релиз-кандидата .tgz в dist/. Ничего не меняет в runtime.
#
#   DSH_CRON_APPROVED=yes bash deploy.sh install <exact-version>
#       Установка ТОЧНОЙ опубликованной registry-версии в production web-профиль
#       и post-install проверки. Требует явного «ок» владельца (см. корневой
#       AGENTS.md): без DSH_CRON_APPROVED=yes скрипт откажется выполняться.
#       До публикации production получает только проверенный кандидат .tgz из
#       main по общему release-workflow — не из DEV/worktree.
#
# Скрипт не содержит секретов, не делает rsync/scp/копирование, не трогает
# конфиги и данные, не использует force-режимы.

set -euo pipefail

MODE="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PACKAGE_NAME="@goodandready/dsh-cron"
SIZE_HARD_LIMIT=262144   # 256 KiB — отклоняет DSH Store
SIZE_WARN_LIMIT=256000   # практический порог предупреждения

fail() { echo "ERROR: $*" >&2; exit 1; }

require_node() {
  command -v node >/dev/null 2>&1 || fail "node not found in PATH"
  command -v npm >/dev/null 2>&1 || fail "npm not found in PATH"
}

print_context() {
  echo "package: $PACKAGE_NAME"
  echo "version: $(node -p "require('./package.json').version")"
  echo "branch:  $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "commit:  $(git rev-parse HEAD 2>/dev/null || echo unknown)"
}

install_test_deps() {
  # Минимальный набор для node --test без харнесса; ничего не пишет в манифесты.
  if [ ! -d node_modules/croner ] || [ ! -d node_modules/@deepseek-ai/dsh-tools ]; then
    npm install --no-save --no-audit --no-fund --loglevel=error \
      croner@9.1.0 @deepseek-ai/dsh-tools@0.1.2-rc.1 @deepseek-ai/schemastery@3.18.1
  fi
}

run_tests() {
  npm test
}

pack_size_gate() {
  npm pack --dry-run --json | node -e '
    let s = "";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      const data = JSON.parse(s);
      // npm <11 emits an array of pack summaries, npm >=11 an object keyed by package id
      const entry = Array.isArray(data) ? data[0] : Object.values(data)[0];
      const files = (entry && entry.files) || [];
      if (!files.length) {
        console.error("BLOCKED pack listing is empty — cannot verify the DSH Store size limit");
        process.exit(1);
      }
      const warn = files.filter(f => f.size >= 256000 && f.size <= 262144);
      const bad = files.filter(f => f.size > 262144);
      for (const f of warn) console.error(`WARNING ${f.size} bytes ${f.path}`);
      for (const f of bad) console.error(`BLOCKED ${f.size} bytes ${f.path}`);
      if (bad.length) process.exit(1);
      console.log(`size gate: ${files.length} files, all <= 256 KiB`);
    });'
}

build_candidate() {
  mkdir -p dist
  rm -f dist/*.tgz
  local tarball
  tarball="$(npm pack --loglevel=error | tail -1)"
  mv "$tarball" dist/
  echo "candidate: dist/$tarball"
}

post_install_checks() {
  local expected_version="$1"
  echo "--- post-install checks ---"
  local listed
  listed="$(dsh plugin --profile web list 2>/dev/null | grep -F "$PACKAGE_NAME@$expected_version" || true)"
  [ -n "$listed" ] || fail "installed profile does not report $PACKAGE_NAME@$expected_version"
  echo "profile: $listed"
  curl -fsS -o /dev/null http://127.0.0.1:3080/ || fail "DSH web UI is not responding on 127.0.0.1:3080"
  echo "web UI: responding"
  curl -fsS http://127.0.0.1:3080/ | grep -qF "$PACKAGE_NAME" || fail "client entry not found in DSH index"
  curl -fsS -o /dev/null -w "client.js: HTTP %{http_code}\n" \
    "http://127.0.0.1:3080/plugins/$PACKAGE_NAME/client.js"
  echo "post-install checks passed"
}

case "$MODE" in
  check)
    require_node
    print_context
    install_test_deps
    run_tests
    pack_size_gate
    build_candidate
    echo "check: OK — candidate ready for the isolated test server cycle"
    ;;
  install)
    require_node
    command -v dsh >/dev/null 2>&1 || fail "dsh CLI not found in PATH"
    [ "${DSH_CRON_APPROVED:-}" = "yes" ] || fail "production install requires explicit owner approval: run with DSH_CRON_APPROVED=yes"
    local_version="$(node -p "require('./package.json').version")"
    TARGET_VERSION="${2:-}"
    [ -n "$TARGET_VERSION" ] || fail "usage: DSH_CRON_APPROVED=yes bash deploy.sh install <exact-version>"
    [ "$TARGET_VERSION" = "$local_version" ] || fail "target version $TARGET_VERSION does not match package.json $local_version"
    echo "installing $PACKAGE_NAME@$TARGET_VERSION into the DSH web profile"
    dsh plugin --profile web add "$PACKAGE_NAME@$TARGET_VERSION"
    post_install_checks "$TARGET_VERSION"
    ;;
  *)
    fail "usage: bash deploy.sh check | DSH_CRON_APPROVED=yes bash deploy.sh install <exact-version>"
    ;;
esac
