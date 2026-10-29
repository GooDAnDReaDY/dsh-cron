import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TaskSchema,
  validateTaskRecord,
  safeValidateTaskRecord,
  validateTaskPatch,
} from '../lib/task-schema.js';
import {
  TaskSchema as ExportedSchema,
  validateTaskRecord as exportedValidate,
} from '../lib/index.js';

test('Issue #394: TaskSchema is exported and callable', () => {
  assert.ok(TaskSchema, 'TaskSchema must exist');
  assert.equal(TaskSchema, ExportedSchema, 'TaskSchema must be exported from index.js');
  assert.equal(typeof validateTaskRecord, 'function');
  assert.equal(validateTaskRecord, exportedValidate);
});

test('Issue #394: validateTaskRecord sets schema defaults on valid task record', () => {
  const record = validateTaskRecord({
    title: 'Daily Report',
    schedule: '0 9 * * *',
    prompt: 'Summarize status',
  });

  assert.equal(record.title, 'Daily Report');
  assert.equal(record.schedule, '0 9 * * *');
  assert.equal(record.prompt, 'Summarize status');
  assert.equal(record.status, 'active');
  assert.equal(record.type, 'llm');
  assert.equal(record.priority, 5);
  assert.equal(record.schemaVersion, 2);
  assert.equal(record.maxMemoryMb, 0);
  assert.equal(record.executionTimeoutMs, 900000);
  assert.equal(record.maxLogBytesPerRun, 5242880);
  assert.equal(record.cpus, 0);
  assert.equal(record.maxArchiveMonths, 6);
  assert.equal(record.delivery, 'isolated');
  assert.equal(record.timeoutSeconds, 1800);
});

test('Issue #394: validateTaskRecord throws on missing or empty title', () => {
  assert.throws(
    () => validateTaskRecord({ schedule: '0 9 * * *', prompt: 'test' }),
    /Task title cannot be empty/
  );
  assert.throws(
    () => validateTaskRecord({ title: '   ', schedule: '0 9 * * *' }),
    /Task title cannot be empty/
  );
});

test('Issue #394: validateTaskRecord throws on missing or empty schedule', () => {
  assert.throws(
    () => validateTaskRecord({ title: 'Valid Title', schedule: '' }),
    /Task schedule cannot be empty/
  );
  assert.throws(
    () => validateTaskRecord({ title: 'Valid Title' }),
    /Task schedule cannot be empty/
  );
});

test('Issue #394: validateTaskRecord validates HTTP tasks require a valid URL', () => {
  assert.throws(
    () => validateTaskRecord({ title: 'HTTP Job', schedule: '0 * * * *', type: 'http' }),
    /HTTP tasks require a URL/
  );

  assert.throws(
    () => validateTaskRecord({ title: 'HTTP Job', schedule: '0 * * * *', type: 'http', httpUrl: 'not-a-valid-url' }),
    /Invalid HTTP URL/
  );

  const valid = validateTaskRecord({
    title: 'HTTP Job',
    schedule: '0 * * * *',
    type: 'http',
    httpUrl: 'https://api.example.com/check',
  });
  assert.equal(valid.type, 'http');
  assert.equal(valid.httpUrl, 'https://api.example.com/check');
});

test('Issue #394: validateTaskRecord validates SSH and Docker requirements', () => {
  assert.throws(
    () => validateTaskRecord({ title: 'SSH Job', schedule: '0 * * * *', type: 'ssh' }),
    /SSH tasks require sshProfileId.*or sshTarget/
  );

  assert.throws(
    () => validateTaskRecord({ title: 'Docker Job', schedule: '0 * * * *', type: 'docker' }),
    /Docker tasks require dockerImage/
  );

  const validDocker = validateTaskRecord({
    title: 'Docker Job',
    schedule: '0 * * * *',
    type: 'docker',
    dockerImage: 'alpine:latest',
  });
  assert.equal(validDocker.dockerImage, 'alpine:latest');
});

test('Issue #394: validateTaskRecord rejects invalid property types', () => {
  assert.throws(
    () => validateTaskRecord({ title: 12345, schedule: '0 * * * *' }),
    /Task schema validation failed/
  );
  assert.throws(
    () => validateTaskRecord({ title: 'T', schedule: '0 * * * *', maxRetries: 'not-a-number' }),
    /Task schema validation failed/
  );
});

test('Issue #394: safeValidateTaskRecord returns { ok: false, error } without throwing', () => {
  const failure = safeValidateTaskRecord({ title: '' });
  assert.equal(failure.ok, false);
  assert.ok(failure.error);

  const success = safeValidateTaskRecord({
    title: 'Safe Task',
    schedule: '0 0 * * *',
    prompt: 'Backup database',
  });
  assert.equal(success.ok, true);
  assert.equal(success.task.title, 'Safe Task');
});

test('Issue #394: validateTaskPatch filters only allowed patchable fields', () => {
  const res = validateTaskPatch({
    title: 'New Title',
    priority: 10,
    status: 'paused',
    unknownSmuggledKey: 'malicious-data',
    id: 'cannot-patch-id',
  });

  assert.equal(res.ok, true);
  assert.equal(res.patch.title, 'New Title');
  assert.equal(res.patch.priority, 10);
  assert.equal(res.patch.status, 'paused');
  assert.equal(res.patch.unknownSmuggledKey, undefined);
  assert.equal(res.patch.id, undefined);
});
