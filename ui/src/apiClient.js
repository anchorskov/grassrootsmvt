export async function apiFetch(path, options = {}) {
  try {
    const token = localStorage.getItem("access_token");
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
    const res = await fetch(`/api${path}`, { ...options, headers });
    if (res.status === 401) {
      console.warn("Unauthorized – check login");
      // still return the response body for handlers to decide
    }
    const text = await res.text();
    try {
      return JSON.parse(text || "{}");
    } catch (err) {
      return { ok: false, error: "invalid_json", body: text };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
