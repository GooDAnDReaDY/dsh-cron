import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { transformSync } from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const defaultOut = path.join(root, 'lib', 'client.js');

export const MODULES = [
  'lib/client-src/00-open.js',
  'lib/client-src/10-locales.js',
  'lib/client-src/20-styles.js',
  'lib/client-src/30-utils.js',
  'lib/client-src/40-delivery-settings.js',
  'lib/client-src/45-dag-graph-view.js',
  'lib/client-src/46-live-logs-modal.js',
  'lib/client-src/47-analytics-digest-modal.js',
  'lib/client-src/48-timeline-heatmap-view.js',
  'lib/client-src/50-cron-screen-state.js',
  'lib/client-src/52-cron-screen-actions.js',
  'lib/client-src/53-cron-screen-modal-actions.js',
  'lib/client-src/54-cron-screen-analytics-actions.js',
  'lib/client-src/55-cron-screen-view.js',
  'lib/client-src/60-modal-task-form-head.js',
  'lib/client-src/62-modal-task-form-tail.js',
  'lib/client-src/65-modal-dialogs.js',
  'lib/client-src/70-settings-card.js',
  'lib/client-src/80-sidebar-jobs.js',
  'lib/client-src/90-close.js',
];

export function renderClientBundle(repoRoot = root) {
  let out = '';
  for (const rel of MODULES) {
    const file = path.join(repoRoot, rel);
    if (!existsSync(file)) throw new Error(`missing client module: ${rel}`);
    out += readFileSync(file, 'utf8');
    if (!out.endsWith('\n')) out += '\n';
  }

  // Strip JSDoc comment blocks
  out = out.replace(/\/\*\*[\s\S]*?\*\//g, '');

  // Alias React.createElement to _h across all calls to save ~12 KiB and stay under 256 KiB (#368, GH #14)
  const shadowMatch = out.match(/(\((?:[^)]*,\s*)?_h(?:\s*[,)])|\b_h\s*=>|\b(?:const|let|var)\s+_h\b)/);
  if (shadowMatch) {
    throw new Error("Build error: Identifier '_h' shadows React createElement alias in client-src: " + shadowMatch[0]);
  }

  out = out.replace(/\bReact\.createElement\b/g, '_h');
  out = out.replace(
    "const React = window.React || require('react');",
    "const React = window.React || require('react');\n    const _h = (...args) => (React && React.createElement ? React.createElement(...args) : null);"
  );

  // Strip standalone single-line comments while preserving syntax and tokens
  const lines = out.split('\n');
  const compactLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      const prev = compactLines.length > 0 ? compactLines[compactLines.length - 1].trim() : '';
      const next = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
      if (prev.endsWith('{') && next.startsWith('}')) {
        compactLines.push('        void e;');
        continue;
      }
      continue;
    }
    compactLines.push(line.trimEnd());
  }

  // Indentation reduction outside template literals to guarantee bundle is strictly under 256 KiB limit
  let inTemplate = false;
  const formattedLines = [];
  for (const line of compactLines) {
    const countBt = (line.match(/`/g) || []).length;
    if (!inTemplate && countBt % 2 === 0) {
      if (!line.trim()) continue;
      formattedLines.push(line.trim());
    } else if (!inTemplate && countBt % 2 === 1) {
      formattedLines.push(line.trim());
      inTemplate = true;
    } else if (inTemplate && countBt % 2 === 1) {
      if (line.trim()) formattedLines.push(line.trim());
      inTemplate = false;
    } else {
      if (line.trim()) formattedLines.push(line.trim());
    }
  }

  const compact = formattedLines.join('\n').replace(/\n{3,}/g, '\n\n');

  // Verify assembled bundle syntax via esbuild transformSync (#386)
  try {
    transformSync(compact, { loader: 'js', target: 'es2020' });
  } catch (syntaxErr) {
    throw new Error(`esbuild bundle validation error: ${syntaxErr.message}`);
  }

  return compact;
}

const isCheck = process.argv.includes('--check');
const outFlag = process.argv.indexOf('--out');
const outFile = outFlag === -1
  ? defaultOut
  : path.resolve(process.cwd(), process.argv[outFlag + 1] || '');

const bundle = renderClientBundle(root);

if (isCheck) {
  if (!existsSync(outFile)) {
    console.error('[build-client] ERROR: lib/client.js does not exist!');
    process.exit(1);
  }
  const current = readFileSync(outFile, 'utf8');
  if (current !== bundle) {
    console.error('[build-client] ERROR: Drift detected between client-src and lib/client.js! Run "npm run build:client" to sync.');
    process.exit(1);
  }
  console.log('[build-client] Check mode: lib/client.js is up to date.');
  process.exit(0);
}

mkdirSync(path.dirname(outFile), { recursive: true });
const tempOut = `${outFile}.${process.pid}.${Date.now()}.tmp`;
writeFileSync(tempOut, bundle, 'utf8');
try {
  renameSync(tempOut, outFile);
} catch {
  writeFileSync(outFile, bundle, 'utf8');
  try { unlinkSync(tempOut); } catch {}
}

const stats = statSync(outFile);
console.log(`[build-client] Rebuilt lib/client.js from ${MODULES.length} modules (${stats.size} bytes)`);

if (stats.size > 262144) {
  console.error(`[build-client] ERROR: lib/client.js (${stats.size} bytes) exceeds limit (262144 bytes)!`);
  process.exit(1);
}

try {
  execFileSync(process.execPath, ['--check', outFile], { stdio: 'inherit' });
  console.log('[build-client] Syntax check: OK');
} catch (err) {
  console.error('[build-client] Syntax error in assembled lib/client.js!');
  process.exit(1);
}
