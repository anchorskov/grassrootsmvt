(() => {
  window.environmentConfig = {
    shouldBypassAuth() {
      return /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    },
    getApiUrl(endpoint = "", params = {}) {
      const clean = String(endpoint).replace(/^\/?api\/?/, "");
      const qs = new URLSearchParams(params);
      return `/api/${clean}${qs.toString() ? `?${qs}` : ""}`;
    },
    debug(msg, data) {
      const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
      if (isLocal) console.log("[ENV-LOCAL]", msg, data ?? "");
    },
    config: {
      environment: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "local" : "production",
      isLocal: /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    }
  };
})();
