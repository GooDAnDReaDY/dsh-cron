/**
 * Swarm Delegation Engine (#350)
 *
 * Provides parallel multi-agent task execution and swarm decomposition:
 * - Dynamic or static subtask orchestration
 * - Controlled concurrency worker pool (concurrencyLimit)
 * - Fault-tolerant execution (single worker failure does not crash the swarm)
 * - Result aggregation and synthesis
 */

import { parseJsonAnswer } from './llm-ask.js';

export const DEFAULT_SWARM_CONCURRENCY = 3;
export const MAX_SWARM_CONCURRENCY = 10;

/**
 * Sanitizes and normalizes swarm configuration.
 *
 * @param {Object} [swarmConfig]
 * @returns {Object}
 */
export function sanitizeSwarmConfig(swarmConfig) {
  if (!swarmConfig || typeof swarmConfig !== 'object') {
    return {
      concurrencyLimit: DEFAULT_SWARM_CONCURRENCY,
      subtasks: [],
      orchestrator: null,
      synthesizer: null,
    };
  }

  const concurrencyRaw = Number(swarmConfig.concurrencyLimit || swarmConfig.concurrency || DEFAULT_SWARM_CONCURRENCY);
  const concurrencyLimit = Math.min(Math.max(1, Number.isNaN(concurrencyRaw) ? DEFAULT_SWARM_CONCURRENCY : concurrencyRaw), MAX_SWARM_CONCURRENCY);

  let subtasks = [];
  if (Array.isArray(swarmConfig.subtasks)) {
    subtasks = swarmConfig.subtasks.map((st, idx) => ({
      id: String(st.id || `subtask_${idx + 1}`).trim(),
      title: String(st.title || st.id || `Worker ${idx + 1}`).trim(),
      prompt: String(st.prompt || '').trim(),
      model: st.model ? String(st.model).trim() : undefined,
      type: st.type ? String(st.type).trim() : 'llm',
      cwd: st.cwd ? String(st.cwd).trim() : undefined,
      env: st.env && typeof st.env === 'object' ? st.env : undefined,
    })).filter((st) => Boolean(st.prompt));
  }

  let orchestrator = null;
  if (swarmConfig.orchestrator && typeof swarmConfig.orchestrator === 'object') {
    orchestrator = {
      prompt: swarmConfig.orchestrator.prompt ? String(swarmConfig.orchestrator.prompt).trim() : '',
      model: swarmConfig.orchestrator.model ? String(swarmConfig.orchestrator.model).trim() : undefined,
    };
  }

  let synthesizer = null;
  if (swarmConfig.synthesizer && typeof swarmConfig.synthesizer === 'object') {
    synthesizer = {
      prompt: swarmConfig.synthesizer.prompt ? String(swarmConfig.synthesizer.prompt).trim() : '',
      model: swarmConfig.synthesizer.model ? String(swarmConfig.synthesizer.model).trim() : undefined,
      mode: ['summary', 'concat', 'json'].includes(swarmConfig.synthesizer.mode) ? swarmConfig.synthesizer.mode : 'summary',
    };
  }

  return {
    concurrencyLimit,
    subtasks,
    orchestrator,
    synthesizer,
  };
}

/**
 * Builds the orchestrator system prompt for dynamic task decomposition.
 */
const ORCHESTRATOR_SYSTEM_PROMPT = [
  'You are a Swarm Task Orchestrator.',
  'Your role is to decompose the user task into 2 to 8 independent parallel subtasks.',
  'Respond strictly with a JSON object in this format:',
  '{"subtasks": [{"id": "unique_id", "title": "short title", "prompt": "precise instructions for worker"}]}',
  'Do not include markdown code fences outside JSON. Return only valid JSON.',
].join(' ');

/**
 * Executes a list of subtasks using a concurrency-limited pool.
 *
 * @param {Array<Object>} subtasks
 * @param {Function} workerExecutor async (subtask) => { output, error, exitCode }
 * @param {Object} [options]
 * @param {number} [options.concurrencyLimit=3]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array<Object>>} subtaskRuns
 */
export async function executeWorkerPool(subtasks, workerExecutor, { concurrencyLimit = DEFAULT_SWARM_CONCURRENCY, signal } = {}) {
  if (!Array.isArray(subtasks) || subtasks.length === 0) {
    return [];
  }

  const results = new Array(subtasks.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < subtasks.length) {
      if (signal?.aborted) {
        throw new Error('Swarm execution aborted');
      }

      const idx = currentIndex++;
      const st = subtasks[idx];
      const start = Date.now();

      try {
        const res = await workerExecutor(st);
        const durationMs = Date.now() - start;
        results[idx] = {
          id: st.id,
          title: st.title || st.id,
          status: (res && res.error) ? 'error' : 'success',
          output: String((res && (res.output || res.result || res.stdout)) || ''),
          error: res && res.error ? String(res.error) : null,
          durationMs,
        };
      } catch (err) {
        const durationMs = Date.now() - start;
        results[idx] = {
          id: st.id,
          title: st.title || st.id,
          status: 'error',
          output: '',
          error: err?.message || String(err),
          durationMs,
        };
      }
    }
  }

  const limit = Math.max(1, Math.min(concurrencyLimit, subtasks.length));
  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Synthesizes the results of all subtask runs into a final unified report.
 *
 * @param {Object} params
 * @param {Object} params.task
 * @param {Array<Object>} params.subtaskRuns
 * @param {Function} [params.askModel]
 * @returns {Promise<string>}
 */
export async function synthesizeSwarmResults({ task, subtaskRuns, askModel }) {
  const synthesizer = task.swarm?.synthesizer;

  // If a model and prompt are configured, ask LLM to synthesize
  if (synthesizer?.prompt && typeof askModel === 'function') {
    try {
      const summaryContext = subtaskRuns.map((r, i) => [
        `### Worker ${i + 1}: ${r.title} [Status: ${r.status}]`,
        r.error ? `Error: ${r.error}` : '',
        r.output ? `Output:\n${r.output}` : '(no output)',
      ].filter(Boolean).join('\n')).join('\n\n---\n\n');

      const prompt = [
        synthesizer.prompt,
        '',
        '## Worker Subtask Outputs:',
        summaryContext,
      ].join('\n');

      const res = await askModel({
        task,
        prompt,
        system: 'You synthesize multi-agent swarm execution results into a comprehensive, cohesive summary report.',
        preferredModel: synthesizer.model || task.model,
        maxTokens: 2000,
      });

      if (res && res.ok && res.text) {
        return res.text.trim();
      }
    } catch {
      // Fallback to structured joining on failure
    }
  }

  // Default clean markdown synthesis
  const header = `## 🐝 Swarm Execution Report: ${task.title || task.id}\n`;
  const successfulCount = subtaskRuns.filter((r) => r.status === 'success').length;
  const statsLine = `**Summary**: ${successfulCount} / ${subtaskRuns.length} subtasks completed successfully.\n\n`;

  const body = subtaskRuns.map((r) => {
    const icon = r.status === 'success' ? '✅' : '❌';
    const lines = [
      `### ${icon} ${r.title} (${r.durationMs}ms)`,
      r.error ? `> ⚠️ **Error**: ${r.error}` : '',
      r.output ? r.output.trim() : '*(No output produced)*',
    ].filter(Boolean);
    return lines.join('\n\n');
  }).join('\n\n---\n\n');

  return header + statsLine + body;
}

/**
 * Main entry point for executing a swarm task.
 *
 * @param {Object} task
 * @param {Object} options
 * @param {Function} options.executeFn Worker execution handler: async (subtask) => result
 * @param {Function} [options.askModel] Model querying function for dynamic decomposition/synthesis
 * @param {AbortSignal} [options.signal]
 * @param {Object} [options.logger]
 * @returns {Promise<Object>} Execution result { ok, status, output, subtaskRuns, stats }
 */
export async function executeSwarmTask(task, { executeFn, askModel, signal, logger } = {}) {
  const swarmConfig = sanitizeSwarmConfig(task.swarm);
  let subtasks = [...swarmConfig.subtasks];

  // 1. Dynamic decomposition via orchestrator prompt if subtasks not explicitly listed
  if (subtasks.length === 0 && swarmConfig.orchestrator?.prompt && typeof askModel === 'function') {
    try {
      const decompRes = await askModel({
        task,
        prompt: swarmConfig.orchestrator.prompt,
        system: ORCHESTRATOR_SYSTEM_PROMPT,
        preferredModel: swarmConfig.orchestrator.model || task.model,
        maxTokens: 1000,
      });

      if (decompRes && decompRes.ok && decompRes.text) {
        const parsed = parseJsonAnswer(decompRes.text);
        if (parsed && Array.isArray(parsed.subtasks)) {
          subtasks = parsed.subtasks.map((st, i) => ({
            id: String(st.id || `subtask_${i + 1}`).trim(),
            title: String(st.title || st.id || `Worker ${i + 1}`).trim(),
            prompt: String(st.prompt || '').trim(),
            type: st.type || 'llm',
            model: st.model || task.model,
          })).filter((st) => Boolean(st.prompt));
        }
      }
    } catch (err) {
      if (logger) logger.warn(`[dsh-cron] Swarm dynamic decomposition failed: ${err.message}`);
    }
  }

  // Fallback: if still no subtasks, construct single task from prompt
  if (subtasks.length === 0) {
    subtasks = [{
      id: 'worker_1',
      title: task.title || 'Swarm Primary Worker',
      prompt: task.prompt || '',
      type: 'llm',
      model: task.model,
    }];
  }

  const startAll = Date.now();

  // 2. Execute workers concurrently
  const defaultWorkerExecutor = async (st) => {
    if (typeof executeFn === 'function') {
      return executeFn({
        ...task,
        id: `${task.id}__${st.id}`,
        title: `${task.title || task.id} -> ${st.title}`,
        prompt: st.prompt,
        type: st.type || task.type,
        model: st.model || task.model,
      });
    }
    return { output: `Worker ${st.title} completed`, status: 'success' };
  };

  const subtaskRuns = await executeWorkerPool(subtasks, defaultWorkerExecutor, {
    concurrencyLimit: swarmConfig.concurrencyLimit,
    signal,
  });

  const totalDurationMs = Date.now() - startAll;
  const completedCount = subtaskRuns.filter((r) => r.status === 'success').length;
  const failedCount = subtaskRuns.filter((r) => r.status === 'error').length;

  // 3. Synthesize final report
  const output = await synthesizeSwarmResults({ task, subtaskRuns, askModel });

  const status = failedCount === 0 ? 'success' : (completedCount > 0 ? 'warning' : 'error');

  return {
    ok: status !== 'error',
    status,
    output,
    subtaskRuns,
    stats: {
      total: subtasks.length,
      completed: completedCount,
      failed: failedCount,
      totalDurationMs,
    },
  };
}
