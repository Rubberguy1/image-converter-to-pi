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

  getSettings: () => fetch("/api/settings").then(jsonOrThrow),

  updateSettings: (payload) =>
    fetch("/api/settings", {
      method: "PUT",
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

  getScene: () => fetch("/api/scene").then(jsonOrThrow),

  saveScene: (scene) =>
    fetch("/api/scene", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scene),
    }).then(jsonOrThrow),

  enableScene: (enabled) =>
    fetch("/api/scene/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).then(jsonOrThrow),

  pushSceneValue: (name, value) =>
    fetch("/api/scene/value", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, value }),
    }).then(jsonOrThrow),

  scenePreviewUrl: async (scene) => {
    const resp = await fetch("/api/scene/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scene),
    });
    if (!resp.ok) throw new Error("scene preview failed");
    return URL.createObjectURL(await resp.blob());
  },

  perf: () => fetch("/api/perf").then(jsonOrThrow),

  identifyPanels: (on) =>
    fetch("/api/matrix/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    }).then(jsonOrThrow),

  listFonts: () => fetch("/api/fonts").then(jsonOrThrow),

  listScenes: () => fetch("/api/scenes").then(jsonOrThrow),
  saveNamedScene: (name) =>
    fetch("/api/scenes/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(jsonOrThrow),
  loadNamedScene: (name) =>
    fetch("/api/scenes/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(jsonOrThrow),
  deleteNamedScene: (name) =>
    fetch(`/api/scenes/${encodeURIComponent(name)}`, { method: "DELETE" }).then(jsonOrThrow),

  // Preview an image widget's tile at w×h with the given render settings.
  mediaTilePreviewUrl: async (id, settings, w, h) => {
    const resp = await fetch(`/api/media/${id}/preview?w=${w}&h=${h}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!resp.ok) throw new Error("preview failed");
    return URL.createObjectURL(await resp.blob());
  },

  originalUrl: (id) => `/api/media/${id}/original`,
  thumbUrl: (id) => `/api/media/${id}/thumb`,
};
