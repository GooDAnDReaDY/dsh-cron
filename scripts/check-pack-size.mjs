import { execFileSync } from 'node:child_process';

const HARD_LIMIT = 262144;
const WARN_LIMIT = 256000;

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const raw = execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const parsed = JSON.parse(raw);
const pack = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
const files = (pack?.files || []).slice().sort((a, b) => b.size - a.size);
const over = files.filter((file) => file.size > HARD_LIMIT);
const warn = files.filter((file) => file.size > WARN_LIMIT && file.size <= HARD_LIMIT);

for (const file of warn) {
  console.warn(`WARN package file ${file.path} is ${file.size} B (soft limit ${WARN_LIMIT}, hard limit ${HARD_LIMIT})`);
}
if (over.length) {
  for (const file of over) {
    console.error(`FAIL package file ${file.path} is ${file.size} B (hard limit ${HARD_LIMIT})`);
  }
  process.exit(1);
}
console.log(`pack size OK: largest file ${files[0]?.path || 'none'} ${files[0]?.size || 0} B`);
