import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
let failed = 0;

function ok(msg) {
  console.log(`  OK    ${msg}`);
}

function bad(msg) {
  console.error(`  FAIL  ${msg}`);
  failed++;
}

function getFiles(dir, ext = ".js") {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(getFiles(full, ext));
    else if (e.name.endsWith(ext)) files.push(full);
  }
  return files;
}

console.log("=== dsh-cron CI preflight check ===");

// 1. Syntax check on standalone lib JS files (excluding concatenated client-src fragments)
const libRootFiles = fs.readdirSync(path.join(root, "lib"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => path.join(root, "lib", f));
let syntaxErrors = 0;
for (const f of libRootFiles) {
  try {
    execSync(`node --check "${f}"`, { stdio: "pipe" });
  } catch (err) {
    bad(`Syntax error in ${path.relative(root, f)}: ${err.message}`);
    syntaxErrors++;
  }
}
if (syntaxErrors === 0) ok(`node --check passed on all ${libRootFiles.length} standalone files in lib/*.js`);

const libFiles = getFiles(path.join(root, "lib"));

// 2. Empty catch check
const emptyCatchPattern = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
let emptyCatches = 0;
for (const f of libFiles) {
  const c = fs.readFileSync(f, "utf8");
  const matches = c.match(emptyCatchPattern);
  if (matches && matches.length > 0) {
    bad(`${path.relative(root, f)}: contains ${matches.length} empty catch blocks`);
    emptyCatches += matches.length;
  }
}
if (emptyCatches === 0) ok("0 empty catch blocks found in lib/");

// 3. Raw rgba check in client-src
const clientSrcFiles = getFiles(path.join(root, "lib/client-src"));
let rawRgba = 0;
for (const f of clientSrcFiles) {
  const c = fs.readFileSync(f, "utf8");
  const matches = c.match(/rgba\(/g);
  if (matches && matches.length > 0) {
    bad(`${path.relative(root, f)}: contains ${matches.length} raw rgba() instances`);
    rawRgba += matches.length;
  }
}
if (rawRgba === 0) ok("0 raw rgba() instances in lib/client-src/");

// 4. Manifest check
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const injects = pkg.dsh?.client?.inject;
if (Array.isArray(injects) && injects.includes("@deepseek-ai/dsh-client-locale") && injects.includes("@deepseek-ai/dsh-client-ui-slots")) {
  ok("package.json dsh.client.inject contains correct service package references");
} else {
  bad(`package.json dsh.client.inject invalid: ${JSON.stringify(injects)}`);
}

// 5. Package contents & file size check
try {
  const packJson = execSync("npm pack --dry-run --json", { cwd: root, stdio: ["pipe", "pipe", "pipe"] }).toString();
  const p = JSON.parse(packJson);
  const entry = p[0] || p[Object.keys(p)[0]];
  const allowed = /^(lib\/|package\.json$|cordis\.patch\.yml$|README.*\.md$|LICENSE$)/;
  const badFiles = entry.files.filter((f) => !allowed.test(f.path));
  if (badFiles.length) {
    bad(`Unexpected files in npm package: ${badFiles.map((f) => f.path).join(", ")}`);
  } else {
    ok(`npm package files verified (${entry.files.length} files)`);
  }

  const MAX_SIZE = 262144;
  const oversized = entry.files.filter((f) => f.size > MAX_SIZE);
  if (oversized.length) {
    bad(`Files exceeding 256 KiB limit: ${oversized.map((f) => `${f.path} (${f.size}B)`).join(", ")}`);
  } else {
    ok(`No package file exceeds 256 KiB (packed size: ${entry.size} bytes)`);
  }
} catch (err) {
  bad(`npm pack check failed: ${err.message}`);
}

// 6. Leak scan
try {
  const leakOutput = execSync(
    "grep -rn -iE \"192\\.168\\.|10\\.[0-9]+\\.[0-9]+\\.[0-9]+|/mnt/|/opt/|npm_[A-Za-z0-9]{36}|ghp_[A-Za-z0-9]{20,}\" lib test README*.md .gitea --exclude=ci.yml || true",
    { cwd: root, stdio: ["pipe", "pipe", "pipe"] }
  ).toString().trim();
  if (leakOutput) {
    bad(`Leak scan detected private IPs/tokens/internal paths:\n${leakOutput}`);
  } else {
    ok("Leak scan clean: no private IPs, tokens or internal paths");
  }
} catch (err) {
  bad(`Leak scan error: ${err.message}`);
}

console.log(`=== Result: ${failed === 0 ? "PASS" : "FAIL"} (${failed} failures) ===`);
if (failed > 0) process.exit(1);
