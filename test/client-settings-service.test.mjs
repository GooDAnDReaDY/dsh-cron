import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const client = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8")
const source = readFileSync(new URL("../lib/client-src/90-close.js", import.meta.url), "utf8")

test("client fiber does not wait for settingsScope", () => {
  assert.equal(client.includes("'settingsScope'"), false)
  assert.equal(source.includes("'settingsScope'"), false)
  assert.match(source, /inject:\s*\[\s*'slots',\s*'locale'\s*\]/)
})
