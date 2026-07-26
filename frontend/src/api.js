// Thin wrapper around the backend JSON API.
// Every request goes through apiUrl() so the frontend works both served BY the
// Pi (same-origin) and run elsewhere pointed AT the Pi (see backend.js).
import { apiUrl } from "./backend.js";

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

const json = (body) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const get = (path) => fetch(apiUrl(path)).then(jsonOrThrow);
const send = (path, method, body) =>
  fetch(apiUrl(path), { method, ...(body === undefined ? {} : json(body)) }).then(jsonOrThrow);

// POST/PUT for a binary response, returning an object URL.
async function blobUrl(path, method, body) {
  const resp = await fetch(apiUrl(path), { method, ...(body === undefined ? {} : json(body)) });
  if (!resp.ok) throw new Error("request failed");
  return URL.createObjectURL(await resp.blob());
}

export const api = {
  status: () => get("/api/status"),

  listMedia: () => get("/api/media"),

  upload: (file) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(apiUrl("/api/media"), { method: "POST", body: form }).then(jsonOrThrow);
  },

  deleteMedia: (id) => send(`/api/media/${id}`, "DELETE"),

  saveSettings: (id, settings) => send(`/api/media/${id}/settings`, "PUT", settings),

  // Returns an object URL for a panel-sized preview PNG with the given settings.
  previewUrl: (id, settings) => blobUrl(`/api/media/${id}/preview`, "POST", settings),

  display: (id, settings) => send(`/api/display/${id}`, "POST", settings),

  stop: () => send("/api/display/stop", "POST"),

  setBrightness: (value) => send("/api/brightness", "POST", { value }),

  configureWled: (payload) => send("/api/wled", "POST", payload),

  getSettings: () => get("/api/settings"),

  updateSettings: (payload) => send("/api/settings", "PUT", payload),

  musicStatus: () => get("/api/music"),

  configureMusic: (provider, enabled, spin = null) =>
    send("/api/music", "POST", { provider, enabled, spin }),

  getScene: () => get("/api/scene"),

  saveScene: (scene) => send("/api/scene", "PUT", scene),

  enableScene: (enabled) => send("/api/scene/enable", "POST", { enabled }),

  pushSceneValue: (name, value) => send("/api/scene/value", "POST", { name, value }),

  scenePreviewUrl: (scene) => blobUrl("/api/scene/preview", "POST", scene),

  perf: () => get("/api/perf"),

  identifyPanels: (on) => send("/api/matrix/identify", "POST", { on }),

  listFonts: () => get("/api/fonts"),

  listScenes: () => get("/api/scenes"),
  saveNamedScene: (name) => send("/api/scenes/save", "POST", { name }),
  loadNamedScene: (name) => send("/api/scenes/load", "POST", { name }),
  deleteNamedScene: (name) => send(`/api/scenes/${encodeURIComponent(name)}`, "DELETE"),

  // Preview an image widget's tile at w×h with the given render settings.
  mediaTilePreviewUrl: (id, settings, w, h) =>
    blobUrl(`/api/media/${id}/preview?w=${w}&h=${h}`, "POST", settings),

  originalUrl: (id) => apiUrl(`/api/media/${id}/original`),
  thumbUrl: (id) => apiUrl(`/api/media/${id}/thumb`),
};
