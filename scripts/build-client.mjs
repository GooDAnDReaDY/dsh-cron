#!/usr/bin/env node
// Concatenate lib/client-src fragments into lib/client.js (single ModuleLoader entry).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, 'lib', 'client-src');
const outFile = path.join(root, 'lib', 'client.js');

const files = (await readdir(srcDir)).filter((f) => f.endsWith('.js')).sort();
if (files.length === 0) throw new Error('no client-src fragments found in ' + srcDir);

let out = '';
for (const f of files) {
  out += await readFile(path.join(srcDir, f), 'utf8');
  if (!out.endsWith('\n')) out += '\n';
}

// Strip JSDoc comment blocks
out = out.replace(/\/\*\*[\s\S]*?\*\//g, '');

// Alias React.createElement to h across all calls to save ~12 KiB and stay under 256 KiB
out = out.replace(/\bReact\.createElement\b/g, 'h');
out = out.replace(
  "const React = window.React || require('react');",
  "const React = window.React || require('react');\n    const h = (...args) => (React && React.createElement ? React.createElement(...args) : null);"
);

// Strip standalone single-line comments so bundle stays strictly under 256 KiB limit
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

// Collapse multiple consecutive blank lines
let compact = formattedLines.join('\n').replace(/\n{3,}/g, '\n\n');
await writeFile(outFile, compact, 'utf8');
console.log(`built lib/client.js from ${files.length} fragments (${Buffer.byteLength(compact, 'utf8')} bytes)`);
