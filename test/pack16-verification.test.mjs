import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { executeCreateTask } from '../lib/task-create.js';
import { applyTaskPatch } from '../lib/task-patch.js';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';

test('Pack 16 verification suite: GH #6 (permission presets) and GH #7 (backdrop discard)', async (t) => {
  const repoRoot = path.resolve(import.meta.dirname, '..');

  await t.test('1. GH #6: executeCreateTask sanitizes permissionPreset to default for external runtimes', () => {
    const tmpDir = path.join(repoRoot, 'test', 'tmp-pack16-create-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const store = new TaskStore(path.join(tmpDir, 'tasks.json'));
    const scheduler = new TaskScheduler(store);

    t.after(() => {
      scheduler.stopAll();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const externalTypes = ['script', 'node', 'python', 'http', 'ssh', 'docker'];
    for (const extType of externalTypes) {
      const res = executeCreateTask(store, scheduler, {
        title: `Task ${extType}`,
        type: extType,
        schedule: '0 9 * * 1-5',
        prompt: 'echo 1',
        httpUrl: extType === 'http' ? 'http://example.com' : undefined,
        sshTarget: extType === 'ssh' ? 'user@host' : undefined,
        dockerImage: extType === 'docker' ? 'alpine:latest' : undefined,
        permissionPreset: 'full',
      });
      assert.equal(res.task.permissionPreset, 'default', `External runtime ${extType} must default permissionPreset to 'default'`);
    }

    const agentTypes = ['llm', 'skill', 'workflow'];
    for (const agentType of agentTypes) {
      const res = executeCreateTask(store, scheduler, {
        title: `Task ${agentType}`,
        type: agentType,
        schedule: '0 9 * * 1-5',
        prompt: 'help',
        permissionPreset: 'read-only',
      });
      assert.equal(res.task.permissionPreset, 'read-only', `Agent runtime ${agentType} must preserve valid permissionPreset`);
    }
  });

  await t.test('2. GH #6: applyTaskPatch sanitizes permissionPreset to default for external runtimes', () => {
    const tmpDir = path.join(repoRoot, 'test', 'tmp-pack16-patch-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const store = new TaskStore(path.join(tmpDir, 'tasks.json'));
    const scheduler = new TaskScheduler(store);

    t.after(() => {
      scheduler.stopAll();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    store.set({
      id: 'task-script',
      title: 'Script Task',
      type: 'script',
      schedule: '0 9 * * 1-5',
      prompt: 'echo 1',
      permissionPreset: 'default',
    });

    const patchRes = applyTaskPatch({
      store,
      scheduler,
      id: 'task-script',
      body: { permissionPreset: 'full' },
      allowCodeSwitch: true,
    });
    assert.equal(patchRes.ok, true);
    assert.equal(patchRes.task.permissionPreset, 'default', 'Patching permissionPreset on external task must stay default');

    store.set({
      id: 'task-llm',
      title: 'LLM Task',
      type: 'llm',
      schedule: '0 9 * * 1-5',
      prompt: 'hello',
      permissionPreset: 'default',
    });

    const patchLlmRes = applyTaskPatch({
      store,
      scheduler,
      id: 'task-llm',
      body: { permissionPreset: 'workspace-write' },
    });
    assert.equal(patchLlmRes.ok, true);
    assert.equal(patchLlmRes.task.permissionPreset, 'workspace-write', 'Patching permissionPreset on agent task must update');
  });

  await t.test('3. GH #6: client-src forms gate permissionPreset on AGENT_FORM_TYPES', () => {
    const formHeadSrc = fs.readFileSync(path.join(repoRoot, 'lib/client-src/60-modal-task-form-head.js'), 'utf8');
    assert.match(formHeadSrc, /AGENT_FORM_TYPES\.includes\(formType\)\s*\?\s*\(/, 'form-head gates permission select on AGENT_FORM_TYPES');
    assert.match(formHeadSrc, /form\.permissionLabel/, 'form-head includes permission label in gated branch');

    const modalActionsSrc = fs.readFileSync(path.join(repoRoot, 'lib/client-src/53-cron-screen-modal-actions.js'), 'utf8');
    assert.match(modalActionsSrc, /permissionPreset:\s*isAgentType\s*\?\s*formPermissionPreset\s*:\s*'default'/, 'modal-actions saves permissionPreset as default for non-agent types');
  });

  await t.test('4. GH #7: locales define modal.confirmDiscard for en and zh', () => {
    const localesSrc = fs.readFileSync(path.join(repoRoot, 'lib/client-src/10-locales.js'), 'utf8');
    assert.match(localesSrc, /'modal\.confirmDiscard':\s*'Discard unsaved changes\?'/, 'en locale defines modal.confirmDiscard');
    assert.match(localesSrc, /'modal\.confirmDiscard':\s*'放弃未保存的内容？'/, 'zh locale defines modal.confirmDiscard');
  });

  await t.test('5. GH #7: backdrop click, cancel button, and escape key invoke closeManualModalWithConfirm', () => {
    const formHeadSrc = fs.readFileSync(path.join(repoRoot, 'lib/client-src/60-modal-task-form-head.js'), 'utf8');
    assert.match(
      formHeadSrc,
      /manualModalOpen\s*&&\s*React\.createElement\('div',\s*\{\s*className:\s*'dsh-cron-modal-overlay',\s*onClick:\s*\(e\)\s*=>\s*\{\s*if\s*\(e\.target\s*===\s*e\.currentTarget\)\s*closeManualModalWithConfirm\(\);\s*\}\s*\},/,
      'overlay backdrop click calls closeManualModalWithConfirm'
    );

    const formTailSrc = fs.readFileSync(path.join(repoRoot, 'lib/client-src/62-modal-task-form-tail.js'), 'utf8');
    assert.match(
      formTailSrc,
      /className:\s*'dsh-cron-btn-secondary',\s*onClick:\s*closeManualModalWithConfirm/,
      'cancel button calls closeManualModalWithConfirm'
    );

    const stateSrc = fs.readFileSync(path.join(repoRoot, 'lib/client-src/50-cron-screen-state.js'), 'utf8');
    assert.match(
      stateSrc,
      /if\s*\(manualModalOpen\)\s*\{\s*closeManualModalWithConfirm\(\);\s*return;\s*\}/,
      'Escape key handler calls closeManualModalWithConfirm'
    );
    assert.match(stateSrc, /const\s+initialFormSnapshotRef\s*=\s*React\.useRef\(null\);/, 'state declares initialFormSnapshotRef');
    assert.match(stateSrc, /const\s+isFormDirty\s*=\s*\(\)\s*=>/, 'state declares isFormDirty helper');
    assert.match(stateSrc, /const\s+closeManualModalWithConfirm\s*=\s*\(\)\s*=>/, 'state declares closeManualModalWithConfirm helper');
  });

  await t.test('6. Documentation and package version synchronization to 0.2.50 (#312, #313)', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.match(pkg.version, /^0\.2\.(?:50|51)$/, 'package.json version is 0.2.50 or newer');

    const indexMd = fs.readFileSync(path.join(repoRoot, 'index.md'), 'utf8');
    assert.match(indexMd, /0\.2\.50/, 'index.md references version 0.2.50');
    assert.match(indexMd, /0\.2\.49/, 'index.md references previous release 0.2.49');

    const agentsMd = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsMd, /Текущая версия:\s*`0\.2\.(?:50|51)`/, 'AGENTS.md current version is 0.2.50');

    const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /## 0\.2\.50 \(2026-10-08\)/, 'CHANGELOG.md contains 0.2.50 section');
  });
});

