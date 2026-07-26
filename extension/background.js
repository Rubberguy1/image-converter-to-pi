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
// Cache the fetched artwork per track so we can attach it to EVERY post (not
// just the one where the track changed). Otherwise heartbeats arrive art-less
// and the Pi, which samples at one moment, can miss the art for the whole song.
let artKey = null;
let artB64Cache = null;

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
    if (!r.ok) {
      console.log("[PixelPusher] art fetch not ok:", r.status, url.slice(0, 80));
      return null;
    }
    const blob = await r.blob();
    if (blob.size > 3_000_000) {
      console.log("[PixelPusher] art too big:", blob.size);
      return null;
    }
    const b64 = toBase64(await blob.arrayBuffer());
    console.log("[PixelPusher] art fetched:", blob.size, "bytes ->", b64.length, "b64");
    return b64;
  } catch (e) {
    console.log("[PixelPusher] art fetch threw:", e.message, url.slice(0, 80));
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
    const resp = await fetch(baseUrl.replace(/\/+$/, "") + "/api/music/nowplaying", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log(
      "[PixelPusher] POST",
      resp.status,
      "| playing:", body.playing,
      "| title:", body.title,
      "| art_b64:", body.art_b64 ? body.art_b64.length : 0,
      "| art_url:", body.art_url || "none"
    );
  } catch (e) {
    console.log("[PixelPusher] POST failed:", e.message);
  }
}

function pickWinner() {
  const now = Date.now();
  const candidates = [];
  for (const [id, entry] of tabs) {
    if (now - entry.at > STALE_TAB_MS) {
      tabs.delete(id);
      continue;
    }
    if (entry.state.playing) candidates.push(entry);
  }
  if (!candidates.length) return null;
  // Prefer sources that published real Media Session metadata (an actual music
  // player with a title + art) over metadata-less <video>s, so a stray clip
  // can't hijack the panel. Within the chosen group, the most recent wins.
  const withMeta = candidates.filter((e) => e.state.hasMeta);
  const pool = withMeta.length ? withMeta : candidates;
  return pool.reduce((best, e) => (e.at > best.at ? e : best));
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
    // Fetch art once per track (the expensive bit), cache it, and send it on
    // every post so the Pi always has the bytes regardless of when it samples.
    let artB64 = null;
    if (state.playing && state.artwork) {
      if (artKey !== key) {
        artB64 = await fetchArt(state.artwork);
        artKey = key;
        artB64Cache = artB64;
      } else {
        artB64 = artB64Cache;
      }
    } else {
      artKey = null;
      artB64Cache = null;
    }
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
