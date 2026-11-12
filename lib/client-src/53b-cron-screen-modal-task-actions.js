      const openDshModal = () => {
        setDropdownOpen(false);
        setDshPrompt('');
        setDshModalOpen(true);
      };

      const handleStartWithDSH = async () => {
        const text = dshPrompt.trim();
        if (!text) return;

        setDshLoading(true);
        try {
          const { res, data } = await fetchJsonWithTimeout('/dsh-cron/chat/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
          });
          if (!data.ok || !data.sessionId) {
            alert(T_KEY(t, 'dsh.startFailed', { error: data.error || '' }));
            setDshLoading(false);
            return;
          }

          setDshModalOpen(false);
          if (onClose) onClose();
          else toggle.set(false);

          await openSession(ctx, data.sessionId);
        } catch (err) {
          alert(T_KEY(t, 'dsh.launchError', { error: err.message }));
        } finally {
          setDshLoading(false);
        }
      };

      const openChainGraphModal = async (task, chainRunId = null) => {
        setChainGraphModalOpen(true);
        setChainGraphLoading(true);
        setChainGraphData(null);
        setChainGraphRunId(chainRunId);
        try {
          if (chainRunId) {
            const { res, data } = await fetchJsonWithTimeout('/dsh-cron/chains/' + encodeURIComponent(chainRunId));
            if (data && data.ok) {
              setChainGraphData(data);
            }
          } else if (task) {
            const graph = buildTaskGraphModel(tasks || [], [], task.id);
            setChainGraphData({ ok: true, graph, task });
          }
        } catch (err) {
          console.debug('[dsh-cron] chain graph fetch failed', err);
        } finally {
          setChainGraphLoading(false);
        }
      };

      const handleRetryChainStep = async (stepTaskId) => {
        if (!chainGraphRunId || !stepTaskId) return;
        try {
          const { res, data } = await fetchJsonWithTimeout('/dsh-cron/chains/' + encodeURIComponent(chainGraphRunId) + '/retry-from/' + encodeURIComponent(stepTaskId), {
            method: 'POST'
          });
          if (data && data.ok) {
            await openChainGraphModal(null, chainGraphRunId);
          } else {
            alert(data?.error || 'Retry failed');
          }
        } catch (err) {
          alert('Retry failed: ' + err.message);
        }
      };

      const iconHtml = (html) => ({ dangerouslySetInnerHTML: { __html: html } });
      const svgProps = (html) => ({ style: { display: 'flex', alignItems: 'center' }, ...iconHtml(html) });


      function handleOpenLiveLogs(task) {
        if (!task || !task.id) return;
        if (window.__dshLiveLogsEvtSource) {
          try { window.__dshLiveLogsEvtSource.close(); } catch (e) { void e; }
          window.__dshLiveLogsEvtSource = null;
        }
        if (window.__dshLiveLogsPollTimer) {
          clearInterval(window.__dshLiveLogsPollTimer);
          window.__dshLiveLogsPollTimer = null;
        }
        setLiveLogsTaskId(task.id);
        setLiveLogsTaskTitle(task.title || task.id);
        setLiveLogsLines([]);
        setLiveLogsStatus(task.running ? 'connecting' : 'idle');
        setLiveLogsCompleted(false);
        setLiveLogsModalOpen(true);

        const startPollingFallback = () => {
          if (window.__dshLiveLogsPollTimer) return;
          const pollFn = () => {
            fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(task.id) + '/history?limit=1')
              .then(({ data } = {}) => {
                if (data && data.history && data.history.length > 0) {
                  const lastRun = data.history[0];
                  if (lastRun.output || lastRun.error) {
                    const text = lastRun.output || lastRun.error;
                    setLiveLogsLines([{ chunk: text, stream: lastRun.error ? 'stderr' : 'stdout', ts: lastRun.at }]);
                  }
                  if (lastRun.status) {
                    setLiveLogsStatus(lastRun.status);
                    setLiveLogsCompleted(true);
                    if (window.__dshLiveLogsPollTimer) {
                      clearInterval(window.__dshLiveLogsPollTimer);
                      window.__dshLiveLogsPollTimer = null;
                    }
                  }
                }
              })
              .catch((err) => { console.debug?.("[dsh-cron] poll skipped", err); });
          };
          pollFn();
          window.__dshLiveLogsPollTimer = setInterval(pollFn, 2000);
        };

        if (typeof EventSource !== 'undefined') {
          try {
            const streamUrl = '/dsh-cron/tasks/' + encodeURIComponent(task.id) + '/logs/stream';
            const es = new EventSource(streamUrl);
            window.__dshLiveLogsEvtSource = es;
            es.addEventListener('init', (e) => {
              try {
                const d = JSON.parse(e.data);
                if (Array.isArray(d.bufferedLogs)) setLiveLogsLines(d.bufferedLogs);
                if (d.status) setLiveLogsStatus(d.status);
                if (d.status === 'completed') setLiveLogsCompleted(true);
              } catch (err) { void err; }
            });
            es.addEventListener('log', (e) => {
              try {
                const item = JSON.parse(e.data);
                setLiveLogsLines((prev) => [...prev, item]);
                setLiveLogsStatus('running');
              } catch (err) { void err; }
            });
            es.addEventListener('complete', () => {
              setLiveLogsCompleted(true);
              setLiveLogsStatus('completed');
              try { es.close(); } catch (e) { void e; }
              window.__dshLiveLogsEvtSource = null;
            });
            es.onerror = () => {
              try { es.close(); } catch (e) { void e; }
              window.__dshLiveLogsEvtSource = null;
              setLiveLogsStatus((curr) => {
                if (curr === 'running' || curr === 'connecting') {
                  startPollingFallback();
                  return curr;
                }
                return 'completed';
              });
            };
          } catch (err) {
            startPollingFallback();
          }
        } else {
          startPollingFallback();
        }
      }

      function handleCloseLiveLogs() {
        if (window.__dshLiveLogsEvtSource) {
          try { window.__dshLiveLogsEvtSource.close(); } catch (e) { void e; }
          window.__dshLiveLogsEvtSource = null;
        }
        if (window.__dshLiveLogsPollTimer) {
          clearInterval(window.__dshLiveLogsPollTimer);
          window.__dshLiveLogsPollTimer = null;
        }
        setLiveLogsModalOpen(false);
      }
