// Background worker. Collects now-playing reports from every tab, picks the tab
// that's actually playing, fetches its album art, and POSTs the result to the
// Pixel Pusher backend the user configured. Works as a Chromium service worker
// or a Firefox background script — no modules, no top-level await.
const ext = globalThis.browser ?? globalThis.chrome;

const STALE_TAB_MS = 15000; // a tab that hasn't reported in this long is gone
const HEARTBEAT_MS = 20000; // re-POST the current track at least this often

// tabId -> { state, at }
const tabs = new Map();

let lastKey = null;
let lastSentAt = 0;
let sending = false;

async function getConfig() {
  const d = await ext.storage.local.get(["baseUrl", "enabled"]);
  return { baseUrl: (d.baseUrl || "").trim(), enabled: d.enabled !== false };
}

function trackKey(s) {
  return s.playing ? `${s.artist}|${s.title}|${s.album}` : "STOPPED";
}

function toBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchArt(url) {
  if (!url || url.startsWith("data:")) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    if (blob.size > 3_000_000) return null; // the panel is 64px; don't ship huge art
    return toBase64(await blob.arrayBuffer());
  } catch (e) {
    return null;
  }
}

async function postToPi(state, artB64) {
  const { baseUrl, enabled } = await getConfig();
  if (!enabled || !baseUrl) return;
  const body = {
    playing: state.playing,
    title: state.title,
    artist: state.artist,
    album: state.album,
    source: state.host,
  };
  if (state.playing) {
    if (artB64) body.art_b64 = artB64;
    else if (state.artwork) body.art_url = state.artwork; // let the Pi try the URL
  }
  try {
    await fetch(baseUrl.replace(/\/+$/, "") + "/api/music/nowplaying", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    /* Pi unreachable — nothing to do; we'll try again next update */
  }
}

function pickWinner() {
  const now = Date.now();
  let winner = null;
  for (const [id, entry] of tabs) {
    if (now - entry.at > STALE_TAB_MS) {
      tabs.delete(id);
      continue;
    }
    if (entry.state.playing && (!winner || entry.at > winner.at)) {
      winner = entry;
    }
  }
  return winner;
}

async function evaluate() {
  if (sending) return; // avoid overlapping POSTs; the 3s ticks will catch up
  const winner = pickWinner();
  const state = winner
    ? winner.state
    : { playing: false, title: "", artist: "", album: "", artwork: "", host: "" };

  const key = trackKey(state);
  const now = Date.now();
  const changed = key !== lastKey;
  const heartbeatDue = now - lastSentAt > HEARTBEAT_MS;
  if (!changed && !heartbeatDue) return;

  sending = true;
  try {
    // Only refetch art when the track actually changes (art is the expensive bit).
    const artB64 = state.playing && changed && state.artwork
      ? await fetchArt(state.artwork)
      : null;
    await postToPi(state, artB64);
    lastKey = key;
    lastSentAt = now;
  } finally {
    sending = false;
  }
}

ext.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "nowplaying" || !msg.state) return;
  const id = sender && sender.tab ? sender.tab.id : "popup";
  tabs.set(id, { state: msg.state, at: Date.now() });
  evaluate();
});

if (ext.tabs && ext.tabs.onRemoved) {
  ext.tabs.onRemoved.addListener((tabId) => {
    tabs.delete(tabId);
    evaluate();
  });
}
