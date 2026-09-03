# Task Plan — @goodandready/dsh-cron

## Status: IN PROGRESS
Issue: #1 [feat] Scheduled cron tasks, automations and UI overlay
Branch: feat-1-cron-initial

## Phases & Milestones

### Phase 1: Foundation & Architecture
- [x] Create Gitea repository goodandready/dsh-cron
- [x] Register Gitea Issue #1
- [x] Checkout feature branch feat-1-cron-initial
- [x] Create docs/design/DESIGN.md
- [ ] Initialize package.json, cordis.patch.yml, README.md, LICENSE
- [ ] Setup dependencies and tests

### Phase 2: Backend Engine (Scheduler & Session Runner)
- [ ] Storage & state persistence module (lib/store.js)
- [ ] Cron scheduler module (lib/scheduler.js with croner, timezones, retry logic)
- [ ] DSH Session runner (lib/runner.js running prompts in isolated DSH agent sessions)
- [ ] REST API endpoints in lib/index.js (/dsh-cron/tasks, /dsh-cron/tasks/:id/toggle, etc.)
- [ ] LLM Tools (cron_schedule_task, cron_list_tasks, cron_toggle_task, cron_get_history)
- [ ] Slash command /cron interceptor / handler

### Phase 3: Frontend Client & UI Overlay
- [ ] Sidebar button registration (mountSidebarEntry) matching DSH Kanban style
- [ ] Central overlay container (mountCronScreen) over conversation pane
- [ ] UI Header with title, subtitle, search bar and Create dropdown:
  - Create with DSH action
  - Manual setup modal
- [ ] Filter tabs: All, Active, Paused, Completed
- [ ] Task list items with play/pause icons, titles, intervals, and context actions
- [ ] Recommendations / Templates block (Daily digest, Weekly review, Follow-up monitor)
- [ ] Settings card for settings.plugin.item

### Phase 4: Verification & Automated Tests
- [ ] Unit tests for cron parsing, store persistence, API handlers
- [ ] Integration tests in DSH test environment on MiniPC
- [ ] Documentation update (README.md, dsh-documentation-standard)
