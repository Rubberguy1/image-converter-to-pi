// Where the backend (the Pi) lives, so the SAME frontend build can either be
// served by the Pi itself (same-origin, base = "") or run somewhere else and
// point at the Pi.
//
// Resolution order:
//   1. a user override saved in localStorage  (set from the connect screen)
//   2. a build-time default: VITE_API_BASE     (bake a Pi URL into an image)
//   3. "" = same-origin — served by the Pi, or fronted by a reverse proxy that
//      forwards /api to the Pi (the Docker container / the Vite dev proxy).
const KEY = "pp.backendBase";

function clean(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

export function backendBase() {
  try {
    const stored = clean(localStorage.getItem(KEY));
    if (stored) return stored;
  } catch {
    /* localStorage unavailable */
  }
  return clean(import.meta.env.VITE_API_BASE || "");
}

export function setBackendBase(url) {
  const c = clean(url);
  try {
    if (c) localStorage.setItem(KEY, c);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// True when we're pointed at a remote backend (not same-origin).
export function isRemoteBackend() {
  return backendBase() !== "";
}

// Absolute URL for an API path (or WebSocket).
export function apiUrl(path) {
  return backendBase() + path;
}

export function wsUrl(path) {
  const base = backendBase();
  if (!base) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}${path}`;
  }
  const u = new URL(base);
  const proto = u.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${u.host}${path}`;
}

// --- remembered devices (this browser only) -----------------------------------
// A per-user list of Pis the user has connected to, saved in their own browser.
// Nothing is stored server-side; the app never connects to anything the user
// didn't choose.
const DEVICES_KEY = "pp.devices";

export function savedDevices() {
  try {
    const list = JSON.parse(localStorage.getItem(DEVICES_KEY) || "[]");
    return Array.isArray(list) ? list.filter((d) => d && d.url) : [];
  } catch {
    return [];
  }
}

export function rememberDevice(url, name) {
  const u = clean(url);
  if (!u) return;
  const list = savedDevices().filter((d) => d.url !== u);
  list.unshift({ url: u, name: name || u });
  try {
    localStorage.setItem(DEVICES_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* ignore */
  }
}

export function forgetDevice(url) {
  const u = clean(url);
  try {
    localStorage.setItem(DEVICES_KEY, JSON.stringify(savedDevices().filter((d) => d.url !== u)));
  } catch {
    /* ignore */
  }
}
