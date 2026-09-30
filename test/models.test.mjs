import test from 'node:test';
import assert from 'node:assert/strict';
import { getModelsHandler } from '../lib/models-handler.js';

test('getModelsHandler responds with providers and models', async () => {
  const mockLlm = {
    listProviders() {
      return [{ id: 'mock-provider', name: 'Mock Provider' }];
    },
    async listModels(p) {
      if (p === 'mock-provider') return [{ id: 'mock-model', name: 'Mock Model' }];
      return [];
    }
  };
  const mockCtx = {
    get(service) {
      if (service === 'agentDefaultModel') {
        return { currentSelection: () => ({ provider: 'mock-provider', model: 'mock-model' }) };
      }
      return null;
    },
    llm: mockLlm,
  };

  const sendJson = (res, code, data) => {
    res.statusCode = code;
    res.data = data;
  };

  // Test 1: no provider
  const res1 = {};
  await getModelsHandler(mockCtx, { url: '/dsh-cron/models' }, res1, sendJson);
  assert.equal(res1.statusCode, 200);
  assert.equal(res1.data.providers.length, 1);
  assert.equal(res1.data.providers[0].id, 'mock-provider');
  assert.equal(res1.data.models.length, 0);

  // Test 2: with provider
  const res2 = {};
  await getModelsHandler(mockCtx, { url: '/dsh-cron/models?provider=mock-provider' }, res2, sendJson);
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.data.models.length, 1);
  assert.equal(res2.data.models[0].id, 'mock-model');
});