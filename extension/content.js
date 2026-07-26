// Isolated-world content script. It injects inject.js into the page's main
// world (the only place navigator.mediaSession is populated) and relays the
// track updates that script posts back to the extension's background worker.
const ext = globalThis.browser ?? globalThis.chrome;
const TAG = "pixelpusher-nowplaying";

// Inject the main-world reader.
try {
  const s = document.createElement("script");
  s.src = ext.runtime.getURL("inject.js");
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
} catch (e) {
  /* some pages (e.g. strict CSP) block this; nothing we can do */
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== TAG || !data.state) return;
  try {
    ext.runtime.sendMessage({ type: "nowplaying", state: data.state });
  } catch (e) {
    /* background worker asleep / extension reloading */
  }
});
