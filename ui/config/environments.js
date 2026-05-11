(() => {
  const isLocalhost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const useWorkerPort = isLocalhost && location.port === '8788';

  window.environmentConfig = {
    shouldBypassAuth() {
      return isLocalhost;
    },
    getApiUrl(endpoint = "", params = {}) {
      const clean = String(endpoint).replace(/^\/?api\/?/, "");
      const qs = new URLSearchParams(params);
      const base = useWorkerPort ? 'http://localhost:8787' : '';
      return `${base}/api/${clean}${qs.toString() ? `?${qs}` : ""}`;
    },
    debug(msg, data) {
      if (isLocalhost) console.log("[ENV-LOCAL]", msg, data ?? "");
    },
    config: {
      environment: isLocalhost ? "local" : "production",
      isLocal: isLocalhost
    }
  };
})();
