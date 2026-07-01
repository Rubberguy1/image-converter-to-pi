// Thin wrapper around the backend JSON API.

async function jsonOrThrow(resp) {
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return resp.json();
}

export const api = {
  status: () => fetch("/api/status").then(jsonOrThrow),

  listMedia: () => fetch("/api/media").then(jsonOrThrow),

  upload: (file) => {
    const form = new FormData();
    form.append("file", file);
    return fetch("/api/media", { method: "POST", body: form }).then(jsonOrThrow);
  },

  deleteMedia: (id) =>
    fetch(`/api/media/${id}`, { method: "DELETE" }).then(jsonOrThrow),

  saveSettings: (id, settings) =>
    fetch(`/api/media/${id}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).then(jsonOrThrow),

  // Returns an object URL for a panel-sized preview PNG with the given settings.
  previewUrl: async (id, settings) => {
    const resp = await fetch(`/api/media/${id}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!resp.ok) throw new Error("preview failed");
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  },

  display: (id, settings) =>
    fetch(`/api/display/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).then(jsonOrThrow),

  stop: () => fetch("/api/display/stop", { method: "POST" }).then(jsonOrThrow),

  setBrightness: (value) =>
    fetch("/api/brightness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    }).then(jsonOrThrow),

  configureWled: (payload) =>
    fetch("/api/wled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(jsonOrThrow),

  musicStatus: () => fetch("/api/music").then(jsonOrThrow),

  configureMusic: (provider, enabled, spin = null) =>
    fetch("/api/music", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, enabled, spin }),
    }).then(jsonOrThrow),

  originalUrl: (id) => `/api/media/${id}/original`,
  thumbUrl: (id) => `/api/media/${id}/thumb`,
};
