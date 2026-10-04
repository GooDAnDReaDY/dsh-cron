      const actionInProgressRef = React.useRef(new Set());

      const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
          const res = await fetch(url, {
            ...options,
            signal: controller ? controller.signal : options.signal,
          });
          let data = {};
          try {
            data = await res.json();
          } catch (jsonErr) {
            // Re-throw if body reading aborted/timed out (#242)
            if (jsonErr && (jsonErr.name === 'AbortError' || controller?.signal.aborted)) {
              throw jsonErr;
            }
          }
          return { res, data };
        } catch (err) {
          if (err && (err.name === 'AbortError' || controller?.signal.aborted)) {
            const timeoutErr = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
            timeoutErr.isTimeout = true;
            throw timeoutErr;
          }
          throw err;
        } finally {
          if (timer) clearTimeout(timer);
        }
      };
      const fetchWithTimeout = fetchJsonWithTimeout;

      const handleToggleTask = async (id) => {
        if (actionInProgressRef.current.has(id)) return;
        actionInProgressRef.current.add(id);
        try {
          const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(id) + '/toggle', { method: 'POST' }, 15000);
          if (!res.ok || (data && data.ok === false)) {
            const msg = (data && data.error) || `Toggle failed (HTTP ${res.status})`;
            alert(msg);
            return;
          }
          await fetchTasks();
        } catch (err) {
          console.error('[dsh-cron] toggle failed', err);
          alert('Toggle request failed: ' + err.message);
        } finally {
          actionInProgressRef.current.delete(id);
        }
      };

      const handleRunNow = async (id) => {
        if (actionInProgressRef.current.has(id)) return;
        actionInProgressRef.current.add(id);
        const prevTask = tasks.find(t => t.id === id);
        const prevStatus = prevTask ? prevTask.lastStatus : null;
        setTasks(prev => prev.map(t2 => t2.id === id ? { ...t2, lastStatus: 'running' } : t2));
        try {
          const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(id) + '/run', { method: 'POST' }, 15000);
          if (!res.ok || (data && data.ok === false)) {
            setTasks(prev => prev.map(t2 => t2.id === id ? { ...t2, lastStatus: prevStatus } : t2));
            const msg = (data && data.error) || `Run failed (HTTP ${res.status})`;
            alert(msg);
            return;
          }
          setTimeout(() => fetchTasks(), 1500);
        } catch (err) {
          console.error('[dsh-cron] run now error:', err);
          setTasks(prev => prev.map(t2 => t2.id === id ? { ...t2, lastStatus: prevStatus } : t2));
          alert('Run request failed: ' + err.message);
        } finally {
          actionInProgressRef.current.delete(id);
        }
      };

      /** #41: duplicate a task; the server copies config, resets run state (#41). */
      const handleDryRun = async (taskId) => {
        try {
          const res = await fetch('/dsh-cron/tasks/' + encodeURIComponent(taskId) + '/dry-run', { method: 'POST' });
          const data = await res.json();
          setDryRunResult(data);
        } catch (err) {
          alert('Dry run error: ' + err.message);
        }
      };

      const openArchiveModal = async (task, offset = 0) => {
        setArchiveTask(task);
        setArchiveOffset(offset);
        setArchiveLoading(true);
        setArchiveModalOpen(true);
        try {
          const res = await fetch('/dsh-cron/tasks/' + encodeURIComponent(task.id) + '/archive?limit=15&offset=' + offset);
          const data = await res.json();
          if (data.ok) {
            setArchiveRuns(prev => offset === 0 ? (data.runs || []) : [...prev, ...(data.runs || [])]);
            setArchiveTotal(data.total || 0);
          }
        } catch (err) {
          console.error('[dsh-cron] archive load error:', err);
        } finally {
          setArchiveLoading(false);
        }
      };

      const handlePreviewSchedule = async (scheduleExpr) => {
        try {
          const res = await fetch('/dsh-cron/schedule/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedule: scheduleExpr, timezone: formTimezone })
          });
          const data = await res.json();
          if (data.ok && data.runs) {
            setSchedulePreviewRuns(data.runs);
          } else {
            setSchedulePreviewRuns([]);
          }
        } catch {
          setSchedulePreviewRuns([]);
        }
      };

      const handleDuplicate = async (task) => {
        try {
          const res = await fetch('/dsh-cron/tasks/' + encodeURIComponent(task.id) + '/duplicate', { method: 'POST' });
          const data = await res.json();
          if (!data.ok) {
            alert(T_KEY(t, 'duplicate.failed', { error: (data && data.error) || '' }));
            return;
          }
          await fetchTasks();
          // A one-shot copy keeps its original schedule string, so warn instead
          // of letting the user resume a task pointing at a past moment.
          alert(task.oneShot ? T_KEY(t, 'duplicate.oneShotHint') : T_KEY(t, 'duplicate.done'));
        } catch (err) {
          alert(T_KEY(t, 'duplicate.failed', { error: err.message }));
        }
      };

      /** A task id must not shadow a collection route (#42 review finding). */
      const RESERVED_TASK_IDS = ['export', 'import'];

      /** Import needs the script-confirm header when the file has code tasks. */
      const isCodeTaskForm = (x) => {
        if (!x || typeof x !== 'object') return false;
        if (CODE_FORM_TYPES.includes(x.type)) return true;
        if (x.command && String(x.command).trim()) return true;
        if (x.preflightType === 'command' || (x.preflightCommand && String(x.preflightCommand).trim())) return true;
        if (x.selfHealingCommand && String(x.selfHealingCommand).trim()) return true;
        return false;
      };

      const importHeaders = (document_) => {
        const headers = { 'Content-Type': 'application/json' };
        const tasks = (document_ && Array.isArray(document_.tasks)) ? document_.tasks : [];
        if (tasks.some(isCodeTaskForm)) headers[SCRIPT_CONFIRM_HEADER] = 'script';
        return headers;
      };

      /** #42, #240: download the task configuration with honest disclosure and sanitized export choice. */
      const handleExport = async () => {
        setTransferBusy(true);
        try {
          const promptMsg = T_KEY(t, 'transfer.exportPrompt') || 'Choose export mode:\nOK = Sanitized (removes custom env vars & headers)\nCancel = Full raw export';
          const wantSanitized = confirm(promptMsg);
          const exportUrl = '/dsh-cron/tasks/export' + (wantSanitized ? '?sanitize=true' : '');
          const res = await fetch(exportUrl);
          const data = await res.json();
          if (!data.ok) {
            alert(T_KEY(t, 'transfer.exportFailed', { error: (data && data.error) || '' }));
            return;
          }
          const blob = new Blob([JSON.stringify(data.document, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `dsh-cron-tasks-${stamp}${data.sanitized ? '-sanitized' : ''}.json`;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          alert(T_KEY(t, 'transfer.exported', { count: data.count }));
        } catch (err) {
          alert(T_KEY(t, 'transfer.exportFailed', { error: err.message }));
        } finally {
          setTransferBusy(false);
        }
      };

      /** #42: read the picked file, validate it server-side and show the plan. */
      const handleImportFile = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        setTransferBusy(true);
        try {
          const text = await file.text();
          let document_;
          try {
            document_ = JSON.parse(text);
          } catch (parseErr) {
            alert(T_KEY(t, 'transfer.badFile', { error: parseErr.message }));
            return;
          }
          const res = await fetch('/dsh-cron/tasks/import', {
            method: 'POST',
            headers: importHeaders(document_),
            body: JSON.stringify({ document: document_, dryRun: true, strategy: importStrategy })
          });
          const data = await res.json();
          if (!data.ok) {
            alert(T_KEY(t, 'transfer.importFailed', { error: (data && data.error) || '' }));
            return;
          }
          setImportDoc(document_);
          setImportSummary(data.summary);
        } catch (err) {
          alert(T_KEY(t, 'transfer.importFailed', { error: err.message }));
        } finally {
          setTransferBusy(false);
        }
      };

      const handleImportConfirm = async () => {
        if (!importDoc) return;
        setTransferBusy(true);
        try {
          const res = await fetch('/dsh-cron/tasks/import', {
            method: 'POST',
            headers: importHeaders(importDoc),
            body: JSON.stringify({ document: importDoc, strategy: importStrategy })
          });
          const data = await res.json();
          if (!data.ok) {
            alert(T_KEY(t, 'transfer.importFailed', { error: (data && data.error) || '' }));
            return;
          }
          setImportDoc(null);
          setImportSummary(null);
          await fetchTasks();
          alert(T_KEY(t, 'transfer.imported', { count: data.imported }));
        } catch (err) {
          alert(T_KEY(t, 'transfer.importFailed', { error: err.message }));
        } finally {
          setTransferBusy(false);
        }
      };

      /** #49: tune an existing task in a dialogue instead of editing fields. */
      const handleTuneWithDsh = async (task) => {
        const lines = [
          `Tune the existing scheduled task "${task.title}" (id: ${task.id}).`,
          'Its current configuration is:',
          `- type: ${task.type || 'llm'}`,
          `- schedule: ${task.scheduleText || task.schedule} (${task.schedule})`,
          `- status: ${task.status}`,
          task.model ? `- model: ${task.model}${task.fallbackModel ? `, fallback: ${task.fallbackModel}` : ''}` : null,
          Array.isArray(task.channels) && task.channels.length ? `- channels: ${task.channels.join(', ')}` : null,
          `- prompt: ${String(task.prompt || '').slice(0, 400)}`,
          '',
          'Ask what should change, then apply it with the cron tool (action: "update", or action: "get" if you need the full configuration).',
          'If the change makes the task execute code (script/node/python/ssh/docker), confirm it with me explicitly before applying it.',
        ].filter(Boolean);
        try {
          const res = await fetch('/dsh-cron/chat/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: lines.join(String.fromCharCode(10)) })
          });
          const data = await res.json();
          if (!data.ok || !data.sessionId) {
            alert(T_KEY(t, 'tune.startFailed', { error: (data && data.error) || '' }));
            return;
          }
          if (onClose) onClose();
          else toggle.set(false);
          await openSession(ctx, data.sessionId);
        } catch (err) {
          alert(T_KEY(t, 'tune.startFailed', { error: err.message }));
        }
      };

      const handleDelete = async (id) => {
        if (!confirm(T_KEY(t, 'confirm.delete'))) return;
        try {
          await fetch('/dsh-cron/tasks/' + encodeURIComponent(id), { method: 'DELETE' });
          fetchTasks();
        } catch (err) {
          console.debug('[dsh-cron] delete failed', err);
        }
      };

