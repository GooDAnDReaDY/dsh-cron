    function buildSidebarJobRow(state, task) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'dsh-cron-sidebar-job';
      // A distinct attribute: the panel uses data-task-id, and the highlight
      // lookup must never pick a sidebar row instead of a task card.
      row.setAttribute('data-sidebar-task-id', task.id);
      row.setAttribute('aria-label', task.title || task.id);

      const title = document.createElement('span');
      title.className = 'dsh-cron-sidebar-job-title';
      title.textContent = task.title || task.id;
      row.appendChild(title);

      const meta = document.createElement('span');
      meta.className = 'dsh-cron-sidebar-job-meta';
      if (task.running) meta.textContent = T('list.runningNow');
      else if (task.nextRunAt) meta.textContent = new Date(task.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      else meta.textContent = task.scheduleText || task.schedule || '';
      row.appendChild(meta);

      if (task.running) row.classList.add('dsh-cron-pulse');
      row.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.openTaskSignal(task.id);
        if (!state.toggle.isOpen()) state.toggle.toggle();
      });
      return row;
    }

    function renderSidebarJobs(state, tasks) {
      const listEl = state.listEl;
      if (!listEl) return;
      listEl.innerHTML = '';
      if (!tasks.length) {
        const empty = document.createElement('div');
        empty.className = 'dsh-cron-sidebar-empty';
        empty.textContent = T('sidebar.noActiveJobs');
        listEl.appendChild(empty);
        return;
      }
      for (const task of tasks.slice(0, SIDEBAR_JOBS_MAX_ROWS)) listEl.appendChild(buildSidebarJobRow(state, task));
      if (tasks.length > SIDEBAR_JOBS_MAX_ROWS) {
        const more = document.createElement('div');
        more.className = 'dsh-cron-sidebar-more';
        more.textContent = T('sidebar.moreJobs', { count: tasks.length - SIDEBAR_JOBS_MAX_ROWS });
        listEl.appendChild(more);
      }
    }

    async function loadSidebarJobs(state) {
      try {
        const res = await fetch('/dsh-cron/tasks?status=active');
        const data = await res.json();
        if (data && data.ok) renderSidebarJobs(state, data.tasks || []);
      } catch (err) {
        console.debug('[dsh-cron] load sidebar jobs failed', err);
      }
    }

    function applySidebarJobsOpen(state) {
      if (!state.root) return;
      state.root.dataset.open = state.open ? 'true' : 'false';
      if (state.headEl) state.headEl.setAttribute('aria-expanded', state.open ? 'true' : 'false');
      if (state.open) loadSidebarJobs(state);
    }

    function buildSidebarJobsRoot(state, label) {
      const root = document.createElement('div');
      root.className = 'dsh-cron-sidebar-jobs';
      root.setAttribute('data-dsh-plugin', 'dsh-cron');
      root.setAttribute('data-dsh-part', 'sidebar-jobs');

      const headEl = document.createElement('button');
      headEl.type = 'button';
      headEl.className = 'dsh-cron-sidebar-jobs-head';
      headEl.setAttribute('aria-expanded', state.open ? 'true' : 'false');
      headEl.textContent = label;
      headEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.open = !state.open;
        try { window.localStorage.setItem(SIDEBAR_JOBS_KEY, state.open ? '1' : '0'); } catch (err) { /* localStorage write failed */ }
        applySidebarJobsOpen(state);
      });
      root.appendChild(headEl);

      const listEl = document.createElement('div');
      listEl.className = 'dsh-cron-sidebar-jobs-list';
      root.appendChild(listEl);

      state.root = root;
      state.headEl = headEl;
      state.listEl = listEl;
      return root;
    }

    /** Keep the section mounted under the sidebar entry across re-renders. */
    function placeSidebarJobs(state, label) {
      if (state.root !== undefined && state.root.isConnected) return;
      const entry = document.querySelector('[' + ENTRY_ATTR + ']');
      if (entry === null || entry.parentElement === null) return;
      if (state.root === undefined) {
        entry.insertAdjacentElement('afterend', buildSidebarJobsRoot(state, label));
      } else {
        entry.insertAdjacentElement('afterend', state.root);
        // Re-query the refs: the previous nodes may belong to a detached tree.
        state.root = document.querySelector('[data-dsh-part="sidebar-jobs"]') || state.root;
        state.listEl = state.root.querySelector('.dsh-cron-sidebar-jobs-list');
        state.headEl = state.root.querySelector('.dsh-cron-sidebar-jobs-head');
      }
      applySidebarJobsOpen(state);
    }

    /**
     * Collapsible list of active jobs under the sidebar entry (#34).
     *
     * Vanilla DOM like the entry itself: the sidebar is not a React root here.
     * Collapsed by default, state persisted, capped at a few rows with an
     * "and N more" line so a busy schedule cannot push the rest of the sidebar
     * off screen. Clicking a row opens the panel and highlights that task.
     */
    function mountSidebarJobs(toggle, label, openTaskSignal) {
      if (typeof document === 'undefined') return () => {};
      const state = { toggle, openTaskSignal, root: undefined, listEl: undefined, headEl: undefined, open: false };
      try { state.open = window.localStorage.getItem(SIDEBAR_JOBS_KEY) === '1'; } catch (err) { /* localStorage read failed */ }

      const observer = new MutationObserver(() => placeSidebarJobs(state, label));
      observer.observe(document.body, { childList: true, subtree: true });
      placeSidebarJobs(state, label);
      loadSidebarJobs(state);
      const fetchTimer = setInterval(() => {
        let isOpen = false;
        try { isOpen = window.localStorage.getItem(SIDEBAR_JOBS_KEY) === '1'; } catch (err) { /* localStorage poll failed */ }
        if (isOpen) loadSidebarJobs(state);
      }, 30000);

      return () => {
        observer.disconnect();
        clearInterval(fetchTimer);
        if (state.root !== undefined && state.root.isConnected) state.root.remove();
        state.root = undefined;
      };
    }

    function placeEntry(target, entry) {
      let anchor = target;
      let next = target.nextElementSibling;
      while (next !== null && next.tagName === 'BUTTON'
        && String(next.className).indexOf('sidebar-entry') >= 0) {
        anchor = next;
        next = next.nextElementSibling;
      }
      anchor.insertAdjacentElement('afterend', entry);
    }

    function mountSidebarEntry(toggle, label) {
      if (typeof document === 'undefined') return () => {};
      let entry;
      const tryPlace = () => {
        if (entry !== undefined && entry.isConnected) return;
        const target = nativeButton();
        if (target === undefined || target.parentElement === null) return;
        if (target.parentElement.querySelector('[' + ENTRY_ATTR + ']') !== null) return;
        entry = createEntry(target, toggle, label);
        placeEntry(target, entry);
        syncActive();
      };

      const syncActive = () => {
        if (entry === undefined) return;
        if (toggle.isOpen()) entry.dataset.active = 'true';
        else delete entry.dataset.active;
      };

      const observer = new MutationObserver(tryPlace);
      observer.observe(document.body, { childList: true, subtree: true });
      const unsubscribe = toggle.subscribe(syncActive);
      tryPlace();

      return () => {
        observer.disconnect();
        unsubscribe();
        if (entry !== undefined) entry.remove();
        entry = undefined;
      };
    }

