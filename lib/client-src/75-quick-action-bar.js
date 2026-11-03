
// --- IN-SESSION QUICK ACTION BAR (v0.3.37) ---

function sessionIdOf(ctx, props) {
  try {
    if (props && props.session && props.session.id) return String(props.session.id);
    if (props && props.session && props.session.sessionId) return String(props.session.sessionId);
    if (props && props.input && props.input.sessionId) return String(props.input.sessionId);
    if (ctx && ctx.scope && ctx.scope.session) return String(ctx.scope.session.id || ctx.scope.session.header?.id || '');
    if (ctx && typeof ctx.scope?.id === 'string') return ctx.scope.id;
    if (ctx && ctx.session) return String(ctx.session.id || ctx.session.header?.id || '');
  } catch (_e) {
    void _e;
  }
  return '';
}

function SessionQuickActionBar(props) {
  const { ctx, toggle } = props;
  const barT = props.t || translate;
  const [tasks, setTasks] = React.useState([]);
  const [isRunning, setIsRunning] = React.useState(false);
  const [runSuccess, setRunSuccess] = React.useState(false);

  const sessionId = sessionIdOf(ctx, props);

  React.useEffect(() => {
    let unmounted = false;
    const fetchTasks = async () => {
      try {
        const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks');
        void res;
        if (!unmounted && data && Array.isArray(data.tasks)) {
          setTasks(data.tasks);
        }
      } catch (_e) {
        void _e;
      }
    };
    fetchTasks();
    const timer = setInterval(fetchTasks, 15000);
    return () => {
      unmounted = true;
      clearInterval(timer);
    };
  }, [sessionId]);

  const linkedTask = React.useMemo(() => {
    if (!sessionId || !tasks.length) return null;
    return tasks.find((t) => t.lastSessionId === sessionId || t.targetSessionId === sessionId || t.id === sessionId);
  }, [sessionId, tasks]);

  const handleOpenLinked = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (linkedTask) {
      pendingTaskHighlight = linkedTask.id;
    }
    toggle.set(true);
  };

  const handleCreateRecurring = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const sessionObj = props.session || (ctx && ctx.scope && ctx.scope.session);
    const titleVal = (sessionObj && (sessionObj.title || sessionObj.name)) || '';
    pendingTaskPreset = {
      title: titleVal ? titleVal + ' (Cron)' : '',
      targetSessionId: sessionId || '',
      type: 'llm',
      schedule: '0 9 * * 1-5',
    };
    toggle.set(true);
  };

  const handleQuickRun = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!linkedTask || isRunning) return;
    setIsRunning(true);
    setRunSuccess(false);
    try {
      const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(linkedTask.id) + '/run', {
        method: 'POST',
      });
      void res;
      if (data && data.ok) {
        setRunSuccess(true);
        setTimeout(() => setRunSuccess(false), 3000);
      }
    } catch (_err) {
      void _err;
    } finally {
      setIsRunning(false);
    }
  };

  if (linkedTask) {
    const running = linkedTask.running || isRunning;
    return React.createElement('div', {
      className: 'dsh-cron-session-bar',
      'data-dsh-plugin': 'dsh-cron',
    }, [
      React.createElement('span', {
        key: 'icon',
        className: 'dsh-cron-session-bar-icon',
        dangerouslySetInnerHTML: { __html: ICON_TIMER }
      }),
      React.createElement('button', {
        key: 'badge',
        type: 'button',
        className: 'dsh-cron-session-badge' + (running ? ' dsh-cron-pulse' : ''),
        title: linkedTask.title || linkedTask.id,
        onClick: handleOpenLinked,
      }, linkedTask.title || linkedTask.id),
      React.createElement('button', {
        key: 'run-btn',
        type: 'button',
        className: 'dsh-cron-session-run-btn',
        disabled: running,
        title: T_KEY(barT, 'sessionBar.runNow'),
        onClick: handleQuickRun,
      }, running ? '...' : (runSuccess ? '✔' : T_KEY(barT, 'sessionBar.run')))
    ]);
  }

  return React.createElement('button', {
    type: 'button',
    className: 'dsh-cron-session-add-btn',
    'data-dsh-plugin': 'dsh-cron',
    title: T_KEY(barT, 'sessionBar.addRecurringHint'),
    'aria-label': T_KEY(barT, 'sessionBar.addRecurring'),
    onClick: handleCreateRecurring,
  }, [
    React.createElement('span', {
      key: 'icon',
      className: 'dsh-cron-session-bar-icon',
      dangerouslySetInnerHTML: { __html: ICON_TIMER },
    }),
    React.createElement('span', { key: 'label' }, T_KEY(barT, 'sessionBar.addRecurring'))
  ]);
}
