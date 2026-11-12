import { estimateTokenCost } from "../integrations.js";
import path from "node:path";
import { logger } from "../logger.js";
import { bestEffort } from "../best-effort.js";

export async function executeAgentTurn(runner, task, prep) {
    let handle = prep?.handle || null;
    let isResumed = false;
    try {
      // Resolve agent preset (#GH-1, #GH-2): scheduled llm sessions must join an agent preset
      // (default or task-configured), otherwise tools resolve against the empty global layer.
      let presets = null;
      try {
        if (typeof runner.ctx.get === 'function') {
          presets = runner.ctx.get('agentPresets');
        } else {
          presets = runner.ctx.agentPresets;
        }
      } catch {
        presets = null;
      }
      let preset = null;
      if (presets && typeof presets.resolve === 'function') {
        try {
          preset = await presets.resolve(task.agentPreset || undefined);
          if (preset && typeof presets.standingKeyFor === 'function') {
            await presets.standingKeyFor(preset.id);
          }
        } catch (presetErr) {
          logger.warn('[dsh-cron] agent preset unavailable, running without one:', presetErr && presetErr.message);
          preset = null;
        }
      }

      const presetSetup = preset ? {
        setup: async (agentCtx) => {
          if (typeof presets.mount === 'function') {
            await presets.mount(agentCtx, preset.id);
          }
        }
      } : {};

      // If targetSessionId is set, attempt to borrow or resume the existing session (#143, #346, GH #9, GH #23)
      let resumeFailure = null;
      const agents = runner._getAgentsService();
      if (prep.targetSessionId && agents) {
        let liveAgent = null;
        try {
          if (typeof agents.get === 'function') {
            liveAgent = agents.get(prep.targetSessionId);
          }
        } catch (_getErr) {
          liveAgent = null;
        }

        if (liveAgent) {
          handle = { agent: liveAgent, __borrowedLive: true };
          isResumed = true;
          logger.info(`[dsh-cron] borrowed active live session: ${prep.targetSessionId}`);
        } else if (typeof agents.resume === 'function') {
          try {
            handle = await agents.resume({
              sessionId: prep.targetSessionId,
              resumeSessionId: prep.targetSessionId,
              meta: {
                cwd: prep.cwd,
                ...(preset ? { agentPreset: preset.id } : {})
              },
              agentOptions: prep.provider && prep.model ? { provider: prep.provider, model: prep.model } : undefined,
              ...presetSetup,
            });
            isResumed = true;
            logger.info(`[dsh-cron] resumed existing persistent session: ${prep.targetSessionId}`);
          } catch (resumeErr) {
            resumeFailure = resumeErr;
            logger.warn(`[dsh-cron] could not resume session ${prep.targetSessionId} (${resumeErr.message}), fallback creating new session`);
            handle = null;
          }
        }
      }

      // Create new session if not resumed
      if (!handle) {
        const isLockedOrColliding = resumeFailure && /already (?:active|owned|exists)|write handle|locked|collision/i.test(resumeFailure.message || '');
        const targetId = prep.mintSessionId({ fresh: isLockedOrColliding });
        try {
          handle = await agents.create({
            sessionId: targetId,
            meta: {
              cwd: prep.cwd,
              ephemeral: !prep.targetSessionId,
              internal: !prep.targetSessionId,
              ...(preset ? { agentPreset: preset.id } : {})
            },
            agentOptions: prep.provider && prep.model ? { provider: prep.provider, model: prep.model } : undefined,
            ...presetSetup,
          });
        } catch (createErr) {
          if (prep.targetSessionId && targetId === prep.targetSessionId) {
            logger.warn(`[dsh-cron] failed to create session with targetSessionId ${prep.targetSessionId} (${createErr.message}), retrying with fresh session ID`);
            try {
              handle = await agents.create({
                sessionId: prep.mintSessionId({ fresh: true }),
                meta: {
                  cwd: prep.cwd,
                  ephemeral: !prep.targetSessionId,
                  internal: !prep.targetSessionId,
                  ...(preset ? { agentPreset: preset.id } : {})
                },
                agentOptions: prep.provider && prep.model ? { provider: prep.provider, model: prep.model } : undefined,
                ...presetSetup,
              });
            } catch (retryErr) {
              if (resumeFailure) {
                throw new Error(`could not resume session "${prep.targetSessionId}" (${resumeFailure.message}): ${retryErr.message}`);
              }
              throw retryErr;
            }
          } else {
            if (resumeFailure) {
              throw new Error(`could not resume session "${prep.targetSessionId}" (${resumeFailure.message}): ${createErr.message}`);
            }
            throw createErr;
          }
        }
      }

      // workspace attach & archive: register the new session with its workspace ledger so it shows
      // up under the project instead of "ungrouped". attachSession validates
      // that the session cwd resolves to the workspace path, so skip when the
      // run uses an isolated worktree (different cwd) or the workspaceId does
      // not resolve to a registered workspace.
      if (!isResumed && !prep.taskWorktree && task.workspaceId && handle?.agent?.session?.id) {
        await bestEffort('attach-session-to-workspace', () =>
          runner._resolveWorkspace(task)?.attachSession(handle.agent.session.id)
        );
      }

      runner._applyPermissionPreset(task, handle);
      runner._nameSession(task, handle, isResumed);
      await prep.raceAbort(handle.agent.whenIdle());

      // 1. Capture starting sequence before sending user message (#227, #228)
      const session = handle.agent.session;
      const startSeq = (session && typeof session.seq === 'number')
        ? session.seq
        : (Array.isArray(session?.log) ? session.log.length : 0);

      handle.agent.followup(prep.createUserMessage({
        content: [{ type: 'text', text: prep.agentPrompt }],
        source: { kind: 'plugin:dsh-cron', form: 'cron-execute' },
      }));
      // Await agent turn completion (#67), abortable on timeout/overlap (#88)
      if (typeof handle.agent.whenIdle === 'function') {
        await prep.raceAbort(handle.agent.whenIdle());
      }

      // 2. Snapshot events from this turn only (#227, #228)
      let turnEvents = [];
      if (typeof session?.snapshotEvents === 'function') {
        turnEvents = session.snapshotEvents(startSeq) || [];
      } else if (Array.isArray(session?.log)) {
        turnEvents = session.log.slice(startSeq);
      } else if (Array.isArray(handle.agent?.log)) {
        turnEvents = handle.agent.log.slice(startSeq);
      }

      // Extract usage FIRST so failed turns and budget checks have accurate token and cost accounting (#228)
      const usage = runner._extractUsage(handle, turnEvents);
      const costUsd = estimateTokenCost(prep.model, usage);

      // 3. Terminal turn failure and settlement check (#227)
      let hasTerminalEvent = false;
      for (const ev of turnEvents) {
        if (!ev) continue;
        if (ev.type === 'turn/end' || ev.type === 'turn/error' || ev.type === 'turn/failure') {
          hasTerminalEvent = true;
          const reason = ev.data?.reason || ev.reason;
          const reasonKind = (reason && typeof reason === 'object') ? reason.kind : reason;
          if (['error', 'interrupted', 'failed', 'aborted', 'blocked'].includes(reasonKind) || ev.data?.error || ev.error) {
            const errMsg = ev.data?.error?.message || ev.error?.message || reason?.message || (typeof reason === 'string' ? reason : `Agent turn ended with status: ${reasonKind || 'error'}`);
            const err = new Error(errMsg);
            err.reason = reason;
            err.reasonKind = reasonKind;
            err.turnFailed = true;
            err.usage = usage;
            err.costUsd = costUsd;
            err.sessionId = handle.agent.session?.id || null;
            throw err;
          }
        }
      }

      const hasEventLog = typeof session?.snapshotEvents === 'function' || Array.isArray(session?.log) || Array.isArray(handle.agent?.log);
      if (hasEventLog && !hasTerminalEvent) {
        const err = new Error(
          turnEvents.length === 0
            ? 'Agent turn produced no events before quiescence'
            : 'Agent turn ended without terminal completion event'
        );
        err.turnFailed = true;
        err.usage = usage;
        err.costUsd = costUsd;
        err.sessionId = handle.agent.session?.id || null;
        throw err;
      }

      // 4. Extract assistant message text from turn events (#227)
      const messageTexts = [];
      const chunkTexts = [];
      for (const ev of turnEvents) {
        if (!ev) continue;
        if (ev.type === 'assistant/message') {
          const msg = ev.data?.message || ev.data;
          if (msg) {
            if (typeof msg.content === 'string' && msg.content.trim()) {
              messageTexts.push(msg.content.trim());
            } else if (Array.isArray(msg.content)) {
              const parts = msg.content
                .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
                .map((p) => p.text)
                .join('');
              if (parts.trim()) messageTexts.push(parts.trim());
            }
          }
        } else if (ev.type === 'assistant/chunk' && ev.data?.chunk) {
          const chunk = ev.data.chunk;
          if (chunk.type === 'text' && typeof chunk.text === 'string') {
            chunkTexts.push(chunk.text);
          } else if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
            chunkTexts.push(chunk.delta);
          }
        }
      }
      let outputText = messageTexts.length > 0 ? messageTexts.join('\n') : chunkTexts.join('');

      // Fallback if no assistant message text was extracted from turn events
      if (!outputText.trim()) {
        const sessionNote = isResumed
          ? `resumed: ${prep.targetSessionId}`
          : `session: ${handle.agent.session?.id || 'cron'}`;
        outputText = `[dsh-cron] Agent finished turn for task "${task.title}" (${sessionNote})`;
      }

      return {
        output: outputText,
        usage,
        costUsd,
        sessionId: handle.agent.session?.id || null,
      };
    } finally {
      await runner._disposeAgentRun(task, prep, handle);
    }
  }

