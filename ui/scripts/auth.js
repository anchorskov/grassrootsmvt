// ui/scripts/auth.js
// Deprecated: Manual JWT verification removed. Use /api/whoami and Cloudflare Access headers only.

async function initAuthUI() {
  const userInfoDiv = document.getElementById("user-info");

  // Authentication now handled by Cloudflare Access and /api/whoami.
  try {
    const data = await window.apiGet('whoami');
    if (data.authenticated || data.ok) {
      if (userInfoDiv) {
        userInfoDiv.innerHTML = `
          <span class="user-email">${data.email}</span>
          <span class="env-tag">${data.environment || 'production'}</span>
        `;
      }
    } else {
      if (userInfoDiv) {
        userInfoDiv.innerHTML = `<a href="/">Sign In</a>`;
      }
    }
  } catch (err) {
    console.error("Error initializing auth UI:", err);
    if (userInfoDiv) {
      userInfoDiv.innerHTML = `<span class="error">Auth check failed</span>`;
    }
  }
}

// Run immediately on load
document.addEventListener("DOMContentLoaded", initAuthUI);
