#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const allReleases = Object.keys(pkg.dsh?.compatibility?.dshReleases || {});
const args = process.argv.slice(2);
const versionIndex = args.indexOf('--versions');
const versions = versionIndex >= 0 && args[versionIndex + 1]
  ? args[versionIndex + 1].split(',').map((value) => value.trim()).filter(Boolean)
  : allReleases;

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const tarball = resolve(execFileSync(npm, ['pack', '--silent'], { encoding: 'utf8' }).trim().split(/\r?\n/).pop() ?? '');
const pluginPackage = '@goodandready/dsh-cron';

function runDsh(version, cmdArgs, env, timeout = 300_000) {
  return execFileSync(npx, [
    '--yes',
    '--package', `@deepseek-ai/dsh@${version}`,
    'dsh',
    ...cmdArgs,
  ], {
    env,
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForHealth(port) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/dsh-cron/health`, {
        signal: AbortSignal.timeout(1_500),
      });
      if (response.ok) return await response.json();
    } catch {
      // The host is still booting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('health timeout');
}

function stop(child) {
  if (child === undefined) return Promise.resolve();
  return new Promise((resolveStop) => {
    if (child.exitCode !== null) return resolveStop();
    const pid = child.pid;
    const terminate = (signal) => {
      try {
        if (process.platform === 'win32') {
          if (signal === 'SIGKILL') execFileSync('taskkill', ['/pid', String(pid), '/T', '/F']);
          else child.kill(signal);
        } else if (pid !== undefined) {
          process.kill(-pid, signal);
        } else {
          child.kill(signal);
        }
      } catch {
        try { child.kill(signal); } catch { /* already gone */ }
      }
    };
    child.once('exit', resolveStop);
    terminate('SIGTERM');
    setTimeout(() => {
      terminate('SIGKILL');
      resolveStop();
    }, 5_000);
  });
}

let failed = 0;
for (const version of versions) {
  const home = mkdtempSync(join(tmpdir(), `dsh-cron-engine-${version.replace(/[^a-z0-9]/gi, '-')}-`));
  const profile = `engine-${version.replace(/[^a-z0-9]/gi, '-')}`;
  const env = { ...process.env, DSH_HOME: home };
  let child;
  try {
    console.log(`\n== ${version}`);
    console.log('installing core and plugin...');
    runDsh(version, [
      'plugin',
      '--profile', profile,
      'add',
      `@deepseek-ai/dsh-base@${version}`,
      `@deepseek-ai/dsh-web-app@${version}`,
      `file:${tarball}`,
      '--config.minimumReleaseAge=0',
      '--config.strictDepBuilds=false',
    ], env);

    const manifestPath = join(home, 'profiles', profile, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.dsh ??= {};
    manifest.dsh.profile ??= {};
    manifest.dsh.profile.bundles = [
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      pluginPackage,
    ];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    console.log('checking dump-config...');
    const dump = runDsh(version, ['--profile', profile, '--dump-config'], env, 120_000);
    if (!dump.includes('dsh-cron')) throw new Error('plugin missing from dump-config');

    const port = await freePort();
    console.log(`booting web on ${port}...`);
    child = spawn(npx, [
      '--yes',
      '--package', `@deepseek-ai/dsh@${version}`,
      'dsh',
      '--profile', profile,
      '--trusted-host', '127.0.0.1',
      '--no-open',
      '--port', String(port),
    ], {
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    const health = await waitForHealth(port);
    console.log(`OK ${version}: tasks=${health.tasks} port=${port}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${version}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await stop(child);
    try {
      rmSync(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (error) {
      console.error(`cleanup failed for ${version}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

rmSync(tarball, { force: true });
if (failed > 0) {
  console.error(`\n${failed} engine release(s) failed`);
  process.exit(1);
}
console.log(`\nengine matrix passed: ${versions.join(', ')}`);
