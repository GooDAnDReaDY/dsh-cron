import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TASK_TYPES,
  CODE_EXECUTING_TYPES,
  normalizeTaskType,
  splitCommandLine,
  buildNodeInvocation,
  buildPythonInvocation,
  buildHttpRequest,
  buildSshInvocation,
  buildDockerInvocation,
  buildEnv,
  buildInvocation,
} from '../lib/runtimes.js';
import { validateTaskType } from '../lib/index.js';
import { SessionRunner } from '../lib/runner.js';

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-rt-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

test('task types normalize and unknown values fall back to llm', () => {
  for (const t of TASK_TYPES) assert.equal(normalizeTaskType(t), t);
  assert.equal(normalizeTaskType('weird'), 'llm');
  assert.equal(normalizeTaskType(undefined), 'llm');
  assert.ok(CODE_EXECUTING_TYPES.includes('node'));
  assert.ok(CODE_EXECUTING_TYPES.includes('ssh'));
  assert.ok(!CODE_EXECUTING_TYPES.includes('llm'));
});

test('splitCommandLine keeps quoted arguments together', () => {
  assert.deepEqual(splitCommandLine('script.js --flag "a b"'), { path: 'script.js', args: ['--flag', 'a b'] });
  assert.deepEqual(splitCommandLine("'x y.js'"), { path: 'x y.js', args: [] });
  assert.deepEqual(splitCommandLine(''), { path: '', args: [] });
});

test('#5: node invocation resolves files and inline code', () => {
  const file = tmpFile('task.mjs', 'console.log(1)');
  const fileInv = buildNodeInvocation({ prompt: `${file} --x` });
  assert.equal(fileInv.file, process.execPath);
  assert.deepEqual(fileInv.args, [file, '--x']);

  const inline = buildNodeInvocation({ prompt: 'console.log("hi")' });
  assert.deepEqual(inline.args, ['-e', 'console.log("hi")']);

  const esm = buildNodeInvocation({ prompt: 'import fs from "node:fs"; console.log(1)' });
  assert.deepEqual(esm.args, ['--input-type=module', '-e', 'import fs from "node:fs"; console.log(1)']);
});

test('#4: python invocation resolves files, inline code and a venv interpreter', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-py-'));
  fs.mkdirSync(path.join(dir, '.venv', 'bin'), { recursive: true });
  const venvPython = path.join(dir, '.venv', 'bin', 'python');
  fs.writeFileSync(venvPython, '#!/bin/sh\n');

  const inline = buildPythonInvocation({ prompt: 'print(1)' }, dir);
  assert.equal(inline.file, venvPython, 'venv interpreter detected');
  assert.deepEqual(inline.args, ['-c', 'print(1)']);

  const scriptFile = path.join(dir, 'job.py');
  fs.writeFileSync(scriptFile, 'print(2)\n');
  const fileInv = buildPythonInvocation({ prompt: `${scriptFile} --fast` }, dir);
  assert.deepEqual(fileInv.args, [scriptFile, '--fast']);

  const explicit = buildPythonInvocation({ prompt: 'print(3)', pythonPath: '/custom/python' }, dir);
  assert.equal(explicit.file, '/custom/python');
});

test('#7: http request builder validates URL, method, headers and body', () => {
  const req = buildHttpRequest({ httpUrl: 'https://example.test/hook', httpMethod: 'post', httpHeaders: '{"X-A":"1"}', httpBody: '{"a":1}' });
  assert.equal(req.url, 'https://example.test/hook');
  assert.equal(req.method, 'POST');
  assert.deepEqual(req.headers, { 'X-A': '1' });
  assert.equal(req.body, '{"a":1}');

  assert.throws(() => buildHttpRequest({ httpUrl: 'not a url' }), /Invalid HTTP URL/);
  assert.throws(() => buildHttpRequest({}), /requires a URL/);
  assert.throws(() => buildHttpRequest({ httpUrl: 'https://x.test', httpHeaders: 'nope' }), /JSON object/);
});

test('#9: ssh invocation needs a target and carries port/key', () => {
  assert.throws(() => buildSshInvocation({ prompt: 'uname -a' }), /sshTarget/);
  const inv = buildSshInvocation({ sshTarget: 'root@10.0.0.5', sshPort: 2222, sshKeyPath: '/k/id', prompt: 'uptime' });
  assert.equal(inv.file, 'ssh');
  assert.deepEqual(inv.args, ['-p', '2222', '-i', '/k/id', 'root@10.0.0.5', 'uptime']);
});

test('#8: docker invocation passes env, mounts cwd and skips PATH/HOME', () => {
  assert.throws(() => buildDockerInvocation({ prompt: 'x' }, {}), /dockerImage/);
  const inv = buildDockerInvocation(
    { dockerImage: 'python:3.11-slim', prompt: 'python -V', cwd: '/srv/app' },
    { PATH: '/usr/bin', HOME: '/root', FOO: 'bar' }
  );
  assert.equal(inv.file, 'docker');
  const joined = inv.args.join(' ');
  assert.match(joined, /-e FOO=bar/);
  assert.doesNotMatch(joined, /-e PATH=/);
  assert.match(joined, /-v \/srv\/app:\/workspace -w \/workspace/);
  assert.equal(inv.args[inv.args.length - 4], 'python:3.11-slim');
});

test('#38: buildEnv merges task vars and deletes null values', () => {
  const env = buildEnv({ env: { FOO: 'bar', GONE: null } }, { BASE: '1', GONE: 'x' });
  assert.equal(env.FOO, 'bar');
  assert.equal(env.BASE, '1');
  assert.equal('GONE' in env, false);
});

test('buildInvocation dispatches every external runtime', () => {
  assert.equal(buildInvocation({ type: 'script', prompt: 'echo 1' }, process.cwd()).shellCommand, 'echo 1');
  assert.equal(buildInvocation({ type: 'node', prompt: '1' }, process.cwd()).type, 'node');
  assert.equal(buildInvocation({ type: 'python', prompt: '1' }, process.cwd()).type, 'python');
  assert.ok(buildInvocation({ type: 'http', httpUrl: 'https://x.test' }, process.cwd()).http);
  assert.equal(buildInvocation({ type: 'ssh', sshTarget: 'a@b', prompt: 'p' }, process.cwd()).file, 'ssh');
  assert.equal(buildInvocation({ type: 'docker', dockerImage: 'alpine', prompt: 'p' }, process.cwd()).file, 'docker');
});

test('validateTaskType enforces runtime prerequisites', () => {
  assert.equal(validateTaskType('llm', {}), null);
  assert.equal(validateTaskType('script', { prompt: 'echo 1' }), null);
  assert.match(validateTaskType('http', { prompt: 'nope' }), /Invalid HTTP URL/);
  assert.equal(validateTaskType('http', { httpUrl: 'https://x.test' }), null);
  assert.match(validateTaskType('ssh', { prompt: 'x' }), /sshProfileId.*or sshTarget/);
  assert.equal(validateTaskType('ssh', { sshProfileId: 'prod' }), null);
  assert.equal(validateTaskType('ssh', { sshTarget: 'root@host' }), null);
  assert.match(validateTaskType('docker', { prompt: 'x' }), /dockerImage/);
  assert.equal(validateTaskType('docker', { dockerImage: 'alpine' }), null);
});

test('#9: ssh tasks run through the dsh-remote-workspace service when available', async () => {
  const calls = [];
  const ctx = {
    get(name) {
      if (name === 'remoteSsh') {
        return {
          exec: async (profile, command, cwd) => {
            calls.push({ profile: profile.id, command, cwd });
            return { code: 0, stdout: 'remote-ok', stderr: '' };
          },
        };
      }
      if (name === 'settings') {
        return {
          get: (ns) => (ns === 'dsh-remote-workspace'
            ? { profiles: [{ id: 'prod', host: 'h', remoteWorkspace: '/srv' }] }
            : null),
        };
      }
      return null;
    },
  };
  const runner = new SessionRunner(ctx);
  const res = await runner.execute({ id: 't', title: 'ssh via service', type: 'ssh', sshProfileId: 'prod', prompt: 'uptime' });
  assert.equal(res.output, 'remote-ok');
  assert.deepEqual(calls, [{ profile: 'prod', command: 'uptime', cwd: '/srv' }]);
});

test('#9: a missing remote profile is reported clearly', async () => {
  const ctx = {
    get(name) {
      if (name === 'remoteSsh') return { exec: async () => ({ code: 0, stdout: '' }) };
      if (name === 'settings') return { get: () => ({ profiles: [] }) };
      return null;
    },
  };
  const runner = new SessionRunner(ctx);
  await assert.rejects(
    () => runner.execute({ id: 't', title: 'ssh', type: 'ssh', sshProfileId: 'ghost', prompt: 'x' }),
    /profile "ghost" was not found/
  );
});

test('#38: task env is injected into the executed process', async () => {
  const runner = new SessionRunner({});
  const res = await runner.execute({
    id: 'env-task',
    title: 'env',
    type: 'script',
    prompt: 'printf "%s" "$DSH_CRON_TEST_VAR"',
    timeoutSeconds: 15,
    env: { DSH_CRON_TEST_VAR: 'injected-value' },
  });
  assert.equal(res.output, 'injected-value');
});
