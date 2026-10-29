import { inspectFailure } from '../failure-inspector.js';
import { applySilentRule } from '../silent-rule.js';
import { logger } from '../logger.js';
import { shouldAutoHeal, applyDoctorFix } from '../doctor.js';

/**
 * Ask the model to diagnose a failed run (#43). Never throws.
 */
export async function inspectFailureRun(task, runInfo, { askModel, readSettingsFn, inspectTimeoutMs }) {
  if (typeof askModel !== 'function') return { inspected: false, error: 'no model is available' };
  const settings = readSettingsFn ? readSettingsFn() : {};
  try {
    return await inspectFailure({
      task,
      runInfo,
      ask: askModel,
      preferredModel: String(settings.inspectorModel || ''),
      timeoutMs: inspectTimeoutMs || 25000,
    });
  } catch (err) {
    return { inspected: false, error: err.message };
  }
}

/**
 * Ask the silent rule whether this run should be delivered (#44).
 * Never throws: any problem means "deliver".
 */
export async function applySilentRuleToRun(task, runInfo, { askModel, readSettingsFn, silentRuleTimeoutMs }) {
  if (typeof askModel !== 'function') return { skipped: false, reason: '' };
  const preferredModel = String((readSettingsFn ? readSettingsFn() : {}).silentRuleModel || '');
  try {
    return await applySilentRule({
      task,
      runInfo,
      ask: askModel,
      preferredModel,
      timeoutMs: silentRuleTimeoutMs || 20000,
    });
  } catch (err) {
    return { skipped: false, reason: '', verdictError: err.message };
  }
}

/**
 * Run the model-assisted steps for a finished run.
 */
export async function applyModelAssists(task, runInfo, options = {}) {
  const inspection = await inspectFailureRun(task, runInfo, options);
  if (inspection.inspected) {
    runInfo.diagnosis = inspection.diagnosis;
    runInfo.suggestion = inspection.suggestion;
    runInfo.confidence = inspection.confidence;
    runInfo.doctorReport = inspection.doctorReport || {
      category: inspection.category || 'runtime_error',
      cause: inspection.diagnosis,
      suggestedFix: inspection.suggestion,
      confidence: inspection.confidence,
      diff: inspection.diff || '',
      timestamp: Date.now(),
      applied: false,
      autoHealed: false,
    };
    logger.info(`[dsh-cron] task "${task.title}" failure diagnosed (${inspection.confidence}): ${inspection.diagnosis}`);

    // Safe Auto-Heal Check (#353)
    if (shouldAutoHeal(task, runInfo.doctorReport)) {
      try {
        const healResult = await applyDoctorFix(task, runInfo.doctorReport, {
          store: options.store,
          user: 'scheduler:auto-heal',
          isAutoHeal: true,
        });
        if (healResult.ok) {
          logger.info(`[dsh-cron] task "${task.title}" auto-healed successfully with doctor fix!`);
          runInfo.autoHealed = true;
          if (runInfo.doctorReport) runInfo.doctorReport.autoHealed = true;
        }
      } catch (autoHealErr) {
        logger.warn(`[dsh-cron] failed to auto-heal task "${task.title}":`, autoHealErr.message);
      }
    }
  } else if (inspection.error && (task.inspectOnFailure || task.autoDiagnose || task.autoHeal)) {
    logger.warn(`[dsh-cron] failure inspection for "${task.title}" not applied: ${inspection.error}`);
  }

  const silent = await applySilentRuleToRun(task, runInfo, options);
  if (silent.skipped) {
    runInfo.silentSkip = true;
    runInfo.silentReason = silent.reason;
    logger.info(`[dsh-cron] task "${task.title}" stayed silent by rule: ${silent.reason || 'no reason given'}`);
  } else if (silent.verdictError) {
    logger.warn(`[dsh-cron] silent rule for "${task.title}" not applied: ${silent.verdictError}`);
  }
  return silent;
}

/**
 * Deliver a finished run to every configured channel (#26).
 */
export async function deliverNotifications(task, runInfo, { store, resolveSecrets, deliver, secretTimeoutMs = 5000 }) {
  try {
    let settings = typeof store?.getSettings === 'function' ? store.getSettings() : {};
    if (resolveSecrets) {
      try {
        let timer;
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`credential resolution timed out after ${secretTimeoutMs}ms`)), secretTimeoutMs);
          if (typeof timer.unref === 'function') timer.unref();
        });
        const resolved = await Promise.race([
          Promise.resolve(resolveSecrets(settings)).finally(() => {
            if (timer) clearTimeout(timer);
          }),
          deadline,
        ]);
        settings = { ...settings, ...(resolved || {}) };
      } catch (secErr) {
        logger.warn('[dsh-cron] credential resolution failed:', secErr.message);
      }
    }
    if (typeof deliver !== 'function') return { status: 'skipped', delivered: [], failures: [] };
    const result = await deliver(task, runInfo, settings);
    if (result && Array.isArray(result.delivered) && result.delivered.length) {
      logger.info(`[dsh-cron] delivered "${task.title}" to: ${result.delivered.map((d) => d.channel).join(', ')}`);
    }
    if (result && Array.isArray(result.failures) && result.failures.length) {
      logger.warn(`[dsh-cron] delivery failures for "${task.title}": ${result.failures.map((f) => `${f.channel}: ${f.error}`).join('; ')}`);
    }
    const delivered = Array.isArray(result?.delivered) ? result.delivered : [];
    const failures = Array.isArray(result?.failures) ? result.failures : [];
    let status = 'skipped';
    if (delivered.length > 0 && failures.length === 0) status = 'delivered';
    else if (delivered.length > 0 && failures.length > 0) status = 'partial';
    else if (delivered.length === 0 && failures.length > 0) status = 'failed';
    return { status, delivered, failures };
  } catch (notifyErr) {
    logger.error('[dsh-cron] notification error:', notifyErr.message);
    return { status: 'failed', delivered: [], failures: [{ channel: 'all', error: notifyErr.message }] };
  }
}

