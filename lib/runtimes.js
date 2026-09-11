/**
 * Runtime invocation builders for non-LLM task types (#4, #5, #7, #8, #9, #38).
 *
 * Every builder is a pure function returning the process invocation
 * ({ file, args, env }) or the HTTP request description, so the whole matrix
 * is unit-testable without spawning anything.
 */

import fs from 'node:fs';
import path from 'node:path';

export const EXTERNAL_RUNTIMES = ['script', 'node', 'python', 'http', 'ssh', 'docker'];
export const AGENT_RUNTIMES = ['llm', 'skill', 'workflow'];
export const TASK_TYPES = [...AGENT_RUNTIMES, ...EXTERNAL_RUNTIMES];

/** Types that execute code and therefore need the HTTP confirm header. */
export const CODE_EXECUTING_TYPES = ['script', 'node', 'python', 'ssh', 'docker'];

export function normalizeTaskType(type) {
  return TASK_TYPES.includes(type) ? type : 'llm';
}

/**
 * Split a leading script path from trailing CLI arguments.
 * Quoted segments are preserved as single arguments.
 */
export function splitCommandLine(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { path: '', args: [] };
  const tokens = trimmed.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const clean = tokens.map((t) => t.replace(/^["']|["']$/g, ''));
  return { path: clean[0] || '', args: clean.slice(1) };
}

function looksLikeScriptFile(token, extensions) {
  if (!token) return false;
  const ext = path.extname(token).toLowerCase();
  if (extensions.includes(ext)) return true;
  try {
    return fs.existsSync(token) && fs.statSync(token).isFile();
  } catch {
    return false;
  }
}

/** #5: resolve a Node.js invocation (inline code or a .js/.mjs/.cjs file). */
export function buildNodeInvocation(task, cwd) {
  const { path: filePath, args } = splitCommandLine(task.prompt);
  if (looksLikeScriptFile(filePath, ['.js', '.mjs', '.cjs'])) {
    return { file: process.execPath, args: [filePath, ...args] };
  }
  const code = String(task.prompt || '');
  const isEsm = /\bimport\s|\bexport\s/.test(code);
  const nodeArgs = isEsm ? ['--input-type=module', '-e', code] : ['-e', code];
  return { file: task.nodePath || process.execPath, args: nodeArgs };
}

/** Find the Python interpreter, preferring a task virtualenv, then the workspace one. */
export function detectPython(task, cwd) {
  if (task.pythonPath) return task.pythonPath;
  const candidates = [];
  if (process.env.VIRTUAL_ENV) {
    candidates.push(path.join(process.env.VIRTUAL_ENV, 'bin', 'python'));
    candidates.push(path.join(process.env.VIRTUAL_ENV, 'Scripts', 'python.exe'));
  }
  const base = cwd || process.cwd();
  candidates.push(path.join(base, '.venv', 'bin', 'python'));
  candidates.push(path.join(base, '.venv', 'Scripts', 'python.exe'));
  candidates.push(path.join(base, 'venv', 'bin', 'python'));
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

/** #4: resolve a Python invocation (inline code or a .py file). */
export function buildPythonInvocation(task, cwd) {
  const interpreter = detectPython(task, cwd);
  const { path: filePath, args } = splitCommandLine(task.prompt);
  if (looksLikeScriptFile(filePath, ['.py'])) {
    return { file: interpreter, args: [filePath, ...args] };
  }
  return { file: interpreter, args: ['-c', String(task.prompt || '')] };
}

/** #7: build the HTTP trigger request description. */
export function buildHttpRequest(task) {
  const raw = String(task.httpUrl || task.prompt || '').trim();
  if (!raw) throw new Error('HTTP task requires a URL (httpUrl or prompt)');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid HTTP URL: ${raw}`);
  }
  let headers = {};
  if (task.httpHeaders) {
    if (typeof task.httpHeaders === 'object') {
      headers = { ...task.httpHeaders };
    } else {
      try {
        headers = JSON.parse(String(task.httpHeaders));
      } catch {
        throw new Error('httpHeaders must be a JSON object');
      }
    }
  }
  const method = String(task.httpMethod || 'GET').toUpperCase();
  const body = task.httpBody !== undefined && task.httpBody !== '' ? String(task.httpBody) : undefined;
  return { url: url.toString(), method, headers, body };
}

/** #9: build a remote SSH invocation. */
export function buildSshInvocation(task) {
  const target = String(task.sshTarget || '').trim();
  if (!target) throw new Error('SSH task requires sshTarget (user@host)');
  const args = [];
  if (task.sshPort) args.push('-p', String(Number(task.sshPort)));
  if (task.sshKeyPath) args.push('-i', String(task.sshKeyPath));
  args.push(target, String(task.prompt || 'true'));
  return { file: 'ssh', args };
}

/** #8: build a Docker run invocation. */
export function buildDockerInvocation(task, env) {
  const image = String(task.dockerImage || '').trim();
  if (!image) throw new Error('Docker task requires dockerImage');
  const args = ['run', '--rm'];
  for (const [key, value] of Object.entries(env || {})) {
    if (key === 'PATH' || key === 'HOME') continue; // container owns those
    args.push('-e', `${key}=${value}`);
  }
  if (task.cwd) args.push('-v', `${task.cwd}:/workspace`, '-w', '/workspace');
  args.push(image, 'sh', '-lc', String(task.prompt || 'true'));
  return { file: 'docker', args };
}

/** #38: merge task env vars over the base environment. */
export function buildEnv(task, baseEnv) {
  const env = { ...(baseEnv || process.env) };
  if (task && task.env && typeof task.env === 'object') {
    for (const [key, value] of Object.entries(task.env)) {
      if (value === null || value === undefined) delete env[key];
      else env[key] = String(value);
    }
  }
  return env;
}

/**
 * Dispatch an external (non-LLM) runtime to its invocation.
 * Returns { file, args } plus an optional `http` descriptor for the fetch path.
 */
export function buildInvocation(task, cwd, baseEnv) {
  const type = normalizeTaskType(task.type);
  const env = buildEnv(task, baseEnv);
  switch (type) {
    case 'node':
      return { type, env, ...buildNodeInvocation(task, cwd) };
    case 'python':
      return { type, env, ...buildPythonInvocation(task, cwd) };
    case 'http':
      return { type, env, http: buildHttpRequest(task) };
    case 'ssh':
      return { type, env, ...buildSshInvocation(task) };
    case 'docker':
      return { type, env, ...buildDockerInvocation(task, env) };
    case 'script':
    default:
      return { type: 'script', env, file: null, args: null, shellCommand: String(task.prompt || '') };
  }
}
