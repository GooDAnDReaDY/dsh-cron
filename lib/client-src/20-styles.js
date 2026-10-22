    const STYLE_ID = 'dsh-cron-styles';
    const CSS_HREF = '/dsh-cron/client.css';

    function ensureStyles() {
      if (typeof document === 'undefined') return null;
      let el = document.getElementById(STYLE_ID);
      if (el === null) {
        const head = document.head || document.documentElement;
        if (!head) return null;
        el = document.createElement('link');
        el.id = STYLE_ID;
        el.rel = 'stylesheet';
        el.href = CSS_HREF;
        // Mark ownership before insertion so neighbor cleanups leave it alone (#91)
        el.dataset.dshPlugin = 'dsh-cron';
        head.appendChild(el);
        return el;
      }
      if (el.getAttribute('href') !== CSS_HREF) {
        el.setAttribute('href', CSS_HREF);
        el.href = CSS_HREF;
      }
      return el;
    }

    // Registry is shared across hot reloads so the newest instance owns exactly
    // one watcher instead of stacking one per module evaluation.
    const STYLE_HEAL_KEY = '__dshCronStyleHeal';
    const STYLE_HEAL_INTERVAL_MS = 2000;

    /**
     * Keep the stylesheet attached: watch <head> (and <html>, which catches a
     * replaced <head>) and re-attach on demand, with a slow interval as the
     * backstop. heal() is idempotent and writes nothing while healthy.
     */
    function startStyleSelfHeal() {
      if (typeof document === 'undefined') return () => {};
      if (typeof window !== 'undefined' && typeof window[STYLE_HEAL_KEY] === 'function') {
        try { window[STYLE_HEAL_KEY](); } catch (_err) { void _err; }
      }
      const heal = () => { try { ensureStyles(); } catch (_err) { void _err; } };
      heal();
      let observer = null;
      try {
        if (typeof MutationObserver === 'function') {
          observer = new MutationObserver(heal);
          if (document.head) observer.observe(document.head, { childList: true });
          if (document.documentElement) observer.observe(document.documentElement, { childList: true });
        }
      } catch (_err) { observer = null; }
      let timer = null;
      try { timer = setInterval(heal, STYLE_HEAL_INTERVAL_MS); } catch (_err) { timer = null; }
      const onVisibility = () => { if (document.visibilityState !== 'hidden') heal(); };
      try { document.addEventListener('visibilitychange', onVisibility); } catch (_err) { void _err; }
      const stop = () => {
        try { if (observer) observer.disconnect(); } catch (_err) { void _err; }
        try { if (timer !== null) clearInterval(timer); } catch (_err) { void _err; }
        try { document.removeEventListener('visibilitychange', onVisibility); } catch (_err) { void _err; }
        if (typeof window !== 'undefined' && window[STYLE_HEAL_KEY] === stop) window[STYLE_HEAL_KEY] = undefined;
      };
      if (typeof window !== 'undefined') window[STYLE_HEAL_KEY] = stop;
      return stop;
    }

