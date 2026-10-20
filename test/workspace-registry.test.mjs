import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { resolveCwd } from '../lib/runner-worktree.js';
import { inject } from '../lib/index.js';

test('Issue #363 / GH #12: lib/index.js injects workspaceRegistry service', () => {
  assert.ok(Array.isArray(inject), 'inject should be an array');
  assert.ok(
    inject.includes('workspaceRegistry'),
    'inject must include "workspaceRegistry" for Cordis to allow host service access'
  );
});

test('Issue #363 / GH #12: resolveCwd resolves workspaceId via ctx.get("workspaceRegistry")', () => {
  const wsId = 'c7e63b28-1111-2222-3333-444455556666';
  const expectedPath = path.join(os.tmpdir(), 'project-alpha');
  const task = { id: 'task-ws-1', workspaceId: wsId };

  const ctx = {
    get: (name) => {
      if (name === 'workspaceRegistry') {
        return {
          get: (id) => {
            if (id === wsId) {
              return { id: wsId, path: expectedPath, title: 'Project Alpha' };
            }
            return undefined;
          }
        };
      }
      return null;
    }
  };

  const resolved = resolveCwd(task, ctx);
  assert.equal(resolved, expectedPath);
});

test('Issue #363 / GH #12: resolveCwd resolves workspaceId via ctx.workspaceRegistry property', () => {
  const wsId = 'd8f74c39-2222-3333-4444-555566667777';
  const expectedPath = path.join(os.tmpdir(), 'project-beta');
  const task = { id: 'task-ws-2', workspaceId: wsId };

  const ctx = {
    workspaceRegistry: {
      get: (id) => (id === wsId ? { id: wsId, path: expectedPath } : undefined)
    }
  };

  const resolved = resolveCwd(task, ctx);
  assert.equal(resolved, expectedPath);
});

test('Issue #363 / GH #12: resolveCwd resolves workspaceId via workspaceRegistry.list() matching path', () => {
  const targetPath = path.join(os.tmpdir(), 'project-gamma');
  const wsId = 'e9a85d40-3333-4444-5555-666677778888';
  const task = { id: 'task-ws-3', workspaceId: targetPath };

  const ctx = {
    get: (name) => {
      if (name === 'workspaceRegistry') {
        return {
          get: () => undefined,
          list: () => [
            { id: wsId, path: targetPath, title: 'Project Gamma' }
          ]
        };
      }
      return null;
    }
  };

  const resolved = resolveCwd(task, ctx);
  assert.equal(resolved, targetPath);
});

test('Issue #363 / GH #12: resolveCwd resolves workspaceId when given an existing directory path on disk', () => {
  const tmpDir = os.tmpdir();
  const task = { id: 'task-ws-4', workspaceId: tmpDir };
  const ctx = { get: () => null };

  const resolved = resolveCwd(task, ctx);
  assert.equal(resolved, tmpDir);
});

test('Issue #363 / GH #12: resolveCwd preserves backward compatibility with legacy workspaces service', () => {
  const wsId = 'legacy-ws-id';
  const expectedPath = path.join(os.tmpdir(), 'legacy-path');
  const task = { id: 'task-ws-legacy', workspaceId: wsId };

  const ctx = {
    get: (name) => {
      if (name === 'workspaces') {
        return {
          get: (id) => (id === wsId ? { path: expectedPath } : undefined)
        };
      }
      return null;
    }
  };

  const resolved = resolveCwd(task, ctx);
  assert.equal(resolved, expectedPath);
});

test('Issue #363 / GH #12: resolveCwd throws fail-closed when workspaceId cannot be resolved', () => {
  const task = { id: 'task-ws-fail', workspaceId: 'nonexistent-uuid-12345' };
  const ctx = {
    get: (name) => {
      if (name === 'workspaceRegistry') {
        return {
          get: () => undefined,
          list: () => []
        };
      }
      return null;
    }
  };

  assert.throws(
    () => resolveCwd(task, ctx),
    /Workspace "nonexistent-uuid-12345" requested by task could not be resolved/
  );
});
