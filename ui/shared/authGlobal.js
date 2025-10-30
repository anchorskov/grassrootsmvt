(() => {
  const listeners = new Set();
  let readyDispatched = false;

  function notify() {
    listeners.forEach(listener => {
      try {
        listener(window.authGlobal);
      } catch (err) {
        console.error('[authGlobal] listener error', err);
      }
    });
  }

  function setState({ user = null, authenticated = false, error = null }) {
    window.authGlobal.user = user;
    window.authGlobal.authenticated = authenticated;
    window.authGlobal.error = error;
    notify();
  }

  async function waitForApiClient() {
    const start = Date.now();
    while (typeof window.apiGet !== 'function') {
      await new Promise(resolve => setTimeout(resolve, 25));
      if (Date.now() - start > 5000) {
        throw new Error('apiClient not ready');
      }
    }
  }

  async function refresh() {
    await waitForApiClient();
    try {
      const data = await window.apiGet('whoami');
      const email = data?.email || data?.user?.email || null;
      setState({
        user: email ? { email, raw: data } : null,
        authenticated: !!email,
        error: null,
      });
      return data;
    } catch (err) {
      setState({ user: null, authenticated: false, error: err });
      if (err && (err.status === 401 || err.status === 403)) {
        if (typeof window.getCurrentUserOrRedirect === 'function') {
          window.getCurrentUserOrRedirect().catch(() => {});
        }
      }
      throw err;
    } finally {
      if (!readyDispatched) {
        readyDispatched = true;
        window.authGlobal.ready = true;
        try {
          window.dispatchEvent(new CustomEvent('authGlobalReady', { detail: window.authGlobal }));
        } catch {
          const fallback = new Event('authGlobalReady');
          fallback.detail = window.authGlobal;
          window.dispatchEvent(fallback);
        }
      }
    }
  }

  const authGlobal = {
    user: null,
    authenticated: false,
    error: null,
    ready: false,
    async refresh() {
      try {
        return await refresh();
      } catch {
        return null;
      }
    },
    onAuthChange(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      if (this.ready) {
        try {
          listener(this);
        } catch (err) {
          console.error('[authGlobal] listener error', err);
        }
      }
      return () => listeners.delete(listener);
    },
  };

  window.authGlobal = authGlobal;

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      authGlobal.refresh();
    });
  }
})();
