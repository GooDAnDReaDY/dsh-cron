import { bestEffort } from './best-effort.js';
import {
  buildInvocation,
} from './runtimes.js';

/**
 * Helper to detect context window overflow errors in persistent sessions (#145).
 */
export function isContextOverflowError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('context length') ||
         msg.includes('context window') ||
         msg.includes('maximum context') ||
         msg.includes('too many tokens') ||
         msg.includes('prompt too long') ||
         msg.includes('token limit') ||
         msg.includes('context_length_exceeded') ||
         msg.includes('string_above_max_length');
}

/**
 * Cross-platform process tree killer (#145).
 * On Windows, calls `taskkill /pid <pid> /T /F` to terminate the entire process hierarchy.
 */
export function terminateProcessTree(child, sig = 'SIGTERM', { isPosix = process.platform !== 'win32', execFn } = {}) {
  if (!child || child.killed) return;
  bestEffort('terminate-process-tree', () => {
    if (isPosix && child.pid) {
      bestEffort('kill-posix-pid', () => process.kill(-child.pid, sig));
    } else if (child.pid) {
      const runner = execFn || ((cmd) => {
        bestEffort('exec-taskkill-fn', () => {
          import('node:child_process').then(({ exec }) => {
            exec(cmd, { windowsHide: true }, () => {});
          }).catch(() => {});
        });
      });
      bestEffort('exec-taskkill', () => runner(`taskkill /pid ${child.pid} /T /F`));
      bestEffort('child-kill', () => child.kill(sig));
    }
  });
}

/**
 * Helper to test if an error code or status is transient and eligible for retry (#134).
 */
export function isTransientError(errOrStatus) {
  if (typeof errOrStatus === 'number') {
    return errOrStatus === 429 || errOrStatus === 502 || errOrStatus === 503 || errOrStatus === 504;
  }
  const str = String(errOrStatus?.message || errOrStatus || '').toLowerCase();
  return str.includes('429') || str.includes('too many requests') ||
         str.includes('502') || str.includes('bad gateway') ||
         str.includes('503') || str.includes('service unavailable') ||
         str.includes('504') || str.includes('gateway timeout') ||
         str.includes('econnreset') || str.includes('etimedout');
}

/** HTTP trigger runtime (#7) with transient retry (#134). */
export async function runHttp(task, request, signal) {
  let attempts = 0;
  const maxAttempts = 3;
  while (attempts < maxAttempts) {
    attempts++;
    try {
      const res = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal,
      });
      const text = await res.text().catch(() => '');
      const summary = `${request.method} ${request.url} -> ${res.status} ${res.statusText || ''}`.trim();
      if (!res.ok) {
        const err = new Error(`${summary}\n${String(text).slice(0, 500)}`);
        if (isTransientError(res.status) && attempts < maxAttempts && !signal?.aborted) {
          console.warn(`[dsh-cron] HTTP request returned ${res.status}, retrying attempt ${attempts + 1}/${maxAttempts}...`);
          await new Promise((r) => setTimeout(r, attempts * 1000));
          continue;
        }
        throw err;
      }
      return {
        output: `${summary}\n${String(text).trim().slice(0, 4000)}`.trim(),
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
        costUsd: 0,
      };
    } catch (err) {
      if (isTransientError(err) && attempts < maxAttempts && !signal?.aborted) {
        console.warn(`[dsh-cron] HTTP request failed (${err.message}), retrying attempt ${attempts + 1}/${maxAttempts}...`);
        await new Promise((r) => setTimeout(r, attempts * 1000));
        continue;
      }
      throw err;
    }
  }
}

/**
 * #9 reuse-first path: when the task names a dsh-remote-workspace profile,
 * execute through that plugin's `remoteSsh` service so host settings and
 * credentials stay owned by it (we only reference the profile id).
 * Returns null when the service or the profile is unavailable so the caller
 * can fall back to a direct ssh invocation.
 */
export async function runViaRemoteWorkspace(task, signal, ctx) {
  if (!task.sshProfileId || !ctx || typeof ctx.get !== 'function') return null;
  let svc = null;
  svc = bestEffort('get-remoteSsh', () => ctx.get('remoteSsh'));
  if (!svc || typeof svc.exec !== 'function') return null;

  let profile = null;
  profile = bestEffort('get-remoteSsh-profile', () => {
    const settings = ctx.get('settings');
    if (settings && typeof settings.get === 'function') {
      const snap = settings.get('dsh-remote-workspace');
      const profiles = snap && Array.isArray(snap.profiles) ? snap.profiles : [];
      return profiles.find((p) => p && p.id === task.sshProfileId) || null;
    }
    return null;
  });
  if (!profile) {
    throw new Error(`remote-workspace profile "${task.sshProfileId}" was not found — check dsh-remote-workspace settings, or use sshTarget instead`);
  }
  const res = await svc.exec(profile, String(task.prompt || 'true'), task.cwd || profile.remoteWorkspace || undefined);
  const output = [res && res.stdout, res && res.stderr].filter((x) => x && String(x).trim()).join('\n').trim();
  const code = res && typeof res.code === 'number' ? res.code : 0;
  if (code !== 0) {
    throw new Error(`Remote command exited with code ${code}\n${output}`.slice(0, 4000));
  }
  return {
    output: output || 'Remote command completed with code 0',
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    costUsd: 0,
  };
}

/** Non-LLM runtimes: shell, Node.js, Python, HTTP, SSH, Docker (#4 #5 #7 #8 #9). */
export async function runExternal(task, runtime, signal, execOptions = {}, { ctx = null, resolveCwdFn = null } = {}) {
  if (runtime === 'ssh' && task.sshProfileId) {
    const viaService = await runViaRemoteWorkspace(task, signal, ctx);
    if (viaService) return viaService;
    if (!task.sshTarget) {
      throw new Error('SSH task needs either a working dsh-remote-workspace profile (sshProfileId) or an sshTarget');
    }
  }
  const cwd = resolveCwdFn ? resolveCwdFn(task) : (task.cwd || process.cwd());
  const invocation = buildInvocation({ ...task, type: runtime }, cwd);
  if (invocation.http) return runHttp(task, invocation.http, signal);

  const { spawn, exec } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    let child = null;
    let settled = false;
    let stdout = '';
    let stderr = '';
    const maxBuffer = 10 * 1024 * 1024;
    const isPosix = process.platform !== 'win32';

    const killProcessTree = (sig = 'SIGTERM') => {
      terminateProcessTree(child, sig, {
        isPosix,
        execFn: (cmd) => {
          bestEffort('exec-cmd', () => exec(cmd, { windowsHide: true }, () => {}));
        }
      });
    };

    const abortHandler = () => {
      killProcessTree('SIGTERM');
      setTimeout(() => killProcessTree('SIGKILL'), 300);
    };

    if (signal) {
      if (signal.aborted) {
        return reject(signal.reason || new Error('Command aborted'));
      }
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    const runEnv = { ...invocation.env };
    if (execOptions?.prevOutput !== undefined) {
      runEnv.DSH_PREV_OUTPUT = String(execOptions.prevOutput);
    }
    const options = {
      cwd,
      env: runEnv,
      detached: isPosix,
      stdio: ['ignore', 'pipe', 'pipe'],
    };

    if (invocation.file) {
      child = spawn(invocation.file, invocation.args || [], options);
    } else {
      const shellPath = isPosix ? (process.env.SHELL || '/bin/bash') : (process.env.ComSpec || 'cmd.exe');
      const shellArgs = isPosix ? ['-c', invocation.shellCommand] : ['/d', '/s', '/c', invocation.shellCommand];
      child = spawn(shellPath, shellArgs, options);
    }

    child.stdout.on('data', (chunk) => {
      if (stdout.length < maxBuffer) stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < maxBuffer) stderr += chunk;
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', abortHandler);
      reject(err);
    });

    child.on('close', (code, sig) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', abortHandler);

      if (signal && signal.aborted) {
        return reject(signal.reason || new Error('Command aborted'));
      }

      if (code !== 0 && code !== null) {
        const detail = String(stderr || '').trim();
        const msg = `${runtime} task exited with code ${code}`;
        return reject(new Error(detail ? `${msg}\n${detail}` : msg));
      }

      const out = (stdout || stderr || '').trim();
      resolve({
        output: out || `${runtime} task completed with code 0`,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
        costUsd: 0,
      });
    });
  });
}

