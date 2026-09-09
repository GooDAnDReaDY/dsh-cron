# Task Plan — @goodandready/dsh-cron

> ARCHIVED (2026-09-09): исходный план задачи #1 перенесён из корня репозитория
> в `.planning/1-cron-initial/` по правилам структуры документации (issue #94).
> Фактическое состояние проекта см. `index.md`, `docs/design/DESIGN.md` и Gitea.
> Все фазы ниже давно выполнены; актуальная работа ведётся по issue #84–#95
> (release-блок 0.2.0, ветка `release/0.2.0`).

## Status: ARCHIVED (was IN PROGRESS)
Issue: #1 [feat] Scheduled cron tasks, automations and UI overlay
Branch: feat-1-cron-initial

## Phases & Milestones

### Phase 1: Foundation & Architecture
- [x] Create Gitea repository goodandready/dsh-cron
- [x] Register Gitea Issue #1
- [x] Checkout feature branch feat-1-cron-initial
- [x] Create docs/design/DESIGN.md
- [x] Initialize package.json, cordis.patch.yml, README.md, LICENSE
- [x] Setup dependencies and tests

### Phase 2: Backend Engine (Scheduler & Session Runner)
- [x] Storage & state persistence module (lib/store.js)
- [x] Cron scheduler module (lib/scheduler.js with croner)
- [x] DSH Session runner (lib/runner.js running prompts in isolated DSH agent sessions)
- [x] REST API endpoints in lib/index.js
- [x] LLM Tools (cron_create_task, cron_schedule_task, cron_list_tasks, cron_pause/resume/delete/run_task)
- [ ] Slash command /cron interceptor — удалено из скоупа (не реализовано; решение 2026-09-09, issue #84)

### Phase 3: Frontend Client & UI Overlay
- [x] Sidebar button registration (mountSidebarEntry) matching DSH Kanban style
- [x] Central overlay container (mountCronScreen) over conversation pane
- [x] UI Header with title, subtitle, search bar and Create dropdown
- [x] Filter tabs: All, Active, Paused, Completed
- [x] Task list items with play/pause icons, titles, intervals, and context actions
- [x] Recommendations / Templates block
- [x] Settings card for settings.plugin.item (key `dsh-cron`, issue #85)

### Phase 4: Verification & Automated Tests
- [x] Unit tests for cron parsing, store persistence, API handlers (43 tests)
- [x] Integration tests in DSH test environment on MiniPC
- [x] Documentation update (README.md tri-lingual, dsh-documentation-standard; issue #84)
