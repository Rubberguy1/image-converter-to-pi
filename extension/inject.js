// Runs in the PAGE's main world (injected by content.js) so it can read the
// site's navigator.mediaSession — which content scripts, in their isolated
// world, cannot see. Reports the current track to the content script via
// window.postMessage. It never talks to the network itself.
(function () {
  const TAG = "pixelpusher-nowplaying";

  function area(sizes) {
    // MediaImage.sizes looks like "512x512" (or "96x96 128x128"); take the first.
    if (!sizes) return 0;
    const m = String(sizes).trim().split(/\s+/)[0].split(/x/i);
    return (parseInt(m[0], 10) || 0) * (parseInt(m[1], 10) || 0);
  }

  function bestArtwork(md) {
    const arts = md && md.artwork ? Array.from(md.artwork) : [];
    if (!arts.length) return "";
    arts.sort((a, b) => area(b.sizes) - area(a.sizes));
    return arts[0].src || "";
  }

  function anyMediaPlaying() {
    const els = document.querySelectorAll("video, audio");
    for (const el of els) {
      if (el.paused || el.ended || el.currentTime <= 0 || el.readyState < 2) continue;
      // Ignore muted / silent media so autoplaying hover-previews and background
      // clips don't count as "now playing" and hijack the panel.
      if (el.muted || el.volume === 0) continue;
      return true;
    }
    return false;
  }

  function read() {
    const ms = navigator.mediaSession;
    const md = ms && ms.metadata;

    // Decide "playing": trust the site's declared playbackState when set,
    // otherwise fall back to whether a media element is actually running.
    let playing = anyMediaPlaying();
    if (ms && ms.playbackState === "playing") playing = true;
    else if (ms && ms.playbackState === "paused") playing = false;

    let title = "";
    let artist = "";
    let album = "";
    let artwork = "";
    if (md) {
      title = md.title || "";
      artist = md.artist || "";
      album = md.album || "";
      artwork = bestArtwork(md);
    }
    // Whether this source published real Media Session metadata (a genuine
    // music/video player) vs. us falling back to the tab title. The background
    // worker uses this to prefer real players over metadata-less <video>s.
    const hasMeta = !!(md && md.title);

    // Jellyfin doesn't publish Media Session artwork for video, but its stream
    // URL carries the item id + an ApiKey — build the cover URL from that.
    if (!artwork) artwork = jellyfinArtwork();

    // Last resort so plain videos without metadata still show *something*.
    if (!title && playing) title = document.title || "";

    return { playing, title, artist, album, artwork, hasMeta, host: location.hostname };
  }

  function jellyfinArtwork() {
    const v = document.querySelector("video");
    const src = v && v.currentSrc;
    if (!src) return "";
    try {
      const u = new URL(src);
      const m = u.pathname.match(/\/Videos\/([0-9a-f]{16,})\//i);
      if (!m) return "";  // not a Jellyfin stream URL
      const key = u.searchParams.get("ApiKey") || u.searchParams.get("api_key");
      if (!key) return "";
      return `${u.origin}/Items/${m[1]}/Images/Primary?maxHeight=400&quality=90&ApiKey=${key}`;
    } catch (e) {
      return "";
    }
  }

  let last = "";
  function tick() {
    let state;
    try {
      state = read();
    } catch (e) {
      return;
    }
    const key = JSON.stringify(state);
    // Post when playing (heartbeat) or whenever the state changes (incl. the
    // playing→paused transition, so the panel can clear).
    if (state.playing || key !== last) {
      window.postMessage({ source: TAG, state }, "*");
    }
    last = key;
  }

  setInterval(tick, 3000);
  document.addEventListener("play", tick, true);
  document.addEventListener("pause", tick, true);
  tick();
})();
