#!/usr/bin/env node
// Concatenate lib/client-src fragments into lib/client.js (single ModuleLoader entry).
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const srcDir = path.join(root, 'lib', 'client-src')
const outFile = path.join(root, 'lib', 'client.js')

const files = (await readdir(srcDir)).filter((f) => f.endsWith('.js')).sort()
if (files.length === 0) throw new Error('no client-src fragments found in ' + srcDir)

let out = ''
for (const f of files) {
  out += await readFile(path.join(srcDir, f), 'utf8')
  if (!out.endsWith('\n')) out += '\n'
}

// Strip JSDoc comment blocks
out = out.replace(/\/\*\*[\s\S]*?\*\//g, '')

// Strip standalone single-line comments so bundle stays strictly under 256 KiB limit
const lines = out.split('\n')
const compactLines = []
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const trimmed = line.trim()
  if (trimmed.startsWith('//')) {
    const prev = compactLines.length > 0 ? compactLines[compactLines.length - 1].trim() : ''
    const next = (i + 1 < lines.length) ? lines[i + 1].trim() : ''
    if (prev.endsWith('{') && next.startsWith('}')) {
      compactLines.push('        void e;')
      continue
    }
    continue
  }
  compactLines.push(line.trimEnd())
}

// Collapse multiple consecutive blank lines
let compact = compactLines.join('\n').replace(/\n{3,}/g, '\n\n')
await writeFile(outFile, compact, 'utf8')
console.log(`built lib/client.js from ${files.length} fragments (${compact.length} bytes)`)
