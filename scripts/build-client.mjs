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

// Indentation reduction (4 spaces -> 2 spaces outside template literals) to guarantee bundle is comfortably under 256 KiB
let inTemplate = false
const formattedLines = []
for (const line of compactLines) {
  const countBt = (line.match(/`/g) || []).length
  if (!inTemplate && countBt % 2 === 0) {
    if (!line.trim()) continue;
    const m = line.match(/^( +)(.*)$/)
    formattedLines.push(m ? ' '.repeat(Math.floor(m[1].length / 4)) + m[2] : line)
  } else if (!inTemplate && countBt % 2 === 1) {
    const m = line.match(/^( +)(.*)$/)
    formattedLines.push(m ? ' '.repeat(Math.floor(m[1].length / 4)) + m[2] : line)
    inTemplate = true
  } else if (inTemplate && countBt % 2 === 1) {
    formattedLines.push(line)
    inTemplate = false
  } else {
    formattedLines.push(line)
  }
}

// Collapse multiple consecutive blank lines
let compact = formattedLines.join('\n').replace(/\n{3,}/g, '\n\n')
await writeFile(outFile, compact, 'utf8')
console.log(`built lib/client.js from ${files.length} fragments (${Buffer.byteLength(compact, 'utf8')} bytes)`)
