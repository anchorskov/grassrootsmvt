// ui/shared/authGlobal.js
// ✅ Global user identity manager for GrassrootsMVT UI
// Works in all HTML and JS without import/export requirements.

window.currentUser = {
  authenticated: false,
  email: null,
  environment: "unknown",
  loaded: false,
};

window.initUserIdentity = async function () {
  try {
    const res = await fetch("/api/whoami", { credentials: "include" });

    if (!res.ok) {
      console.warn(`Auth check returned ${res.status}`);
      window.currentUser = {
        authenticated: false,
        email: null,
        environment: "production",
        loaded: true,
      };
      return window.currentUser;
    }

    const data = await res.json();
    window.currentUser = {
      authenticated: data.authenticated ?? true,
      email: data.email ?? null,
      environment: data.environment ?? "production",
      loaded: true,
    };

    console.log(`✅ Authenticated as ${window.currentUser.email || "anonymous"}`);
    return window.currentUser;
  } catch (err) {
    console.error("Auth check failed:", err);
    window.currentUser = {
      authenticated: false,
      email: null,
      environment: "unknown",
      loaded: true,
    };
    return window.currentUser;
  }
};

// Automatically initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.initUserIdentity();
});
