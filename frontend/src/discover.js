// Find Pixel Pusher devices on the local network from the browser.
//
// Browser reality: a page can only reach a backend it's allowed to (same scheme,
// Private-Network-Access rules). So:
//   • hostname candidates (raspberrypi.local, …) work via the OS's mDNS.
//   • a subnet sweep only works when the app is served over HTTP (a local Docker
//     container, a LAN host, or the dev server) — an HTTPS page can't probe
//     http:// LAN addresses (mixed content), so the sweep is skipped there.
// A device is confirmed by GET /api/status returning our app signature.

const PORT = 8000;
const CANDIDATE_HOSTS = ["raspberrypi.local", "pixelpusher.local", "raspberrypi"];

async function probe(base, timeoutMs) {
  const url = base.replace(/\/+$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${url}/api/status`, { signal: ctrl.signal, mode: "cors" });
    if (!resp.ok) return null;
    const d = await resp.json();
    if (d && (d.app === "pixel-pusher" || d.matrix)) {
      const size = d.matrix ? `${d.matrix.width}×${d.matrix.height}` : "";
      return { url, name: d.name || "Pixel Pusher", detail: size };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Best-effort local subnet prefix (e.g. "192.168.1") via a WebRTC candidate.
export function guessSubnet() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("x");
      pc.onicecandidate = (e) => {
        const c = e && e.candidate && e.candidate.candidate;
        const m = c && c.match(/(\d+\.\d+\.\d+)\.\d+/);
        if (m && !/\.local/.test(c)) {
          finish(m[1]);
          pc.close();
        }
      };
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => finish(null));
      setTimeout(() => finish(null), 1200);
    } catch {
      finish(null);
    }
  });
}

// Discover devices. onFound(list) is called as results arrive.
export async function discover({ subnet, onFound } = {}) {
  const scheme = location.protocol === "https:" ? "https" : "http";
  const found = [];
  const add = (d) => {
    if (d && !found.some((f) => f.url === d.url)) {
      found.push(d);
      onFound && onFound([...found]);
    }
  };

  // 1) mDNS hostname candidates (OS resolves *.local).
  await Promise.all(CANDIDATE_HOSTS.map((h) => probe(`${scheme}://${h}:${PORT}`, 1500).then(add)));

  // 2) Subnet sweep — HTTP pages only (HTTPS can't probe http:// LAN addresses).
  if (subnet && scheme === "http") {
    const base = String(subnet).trim().replace(/\.+$/, "");
    const targets = Array.from({ length: 254 }, (_, i) => `http://${base}.${i + 1}:${PORT}`);
    const CONCURRENCY = 24;
    let i = 0;
    const worker = async () => {
      while (i < targets.length) {
        const mine = i++;
        add(await probe(targets[mine], 900));
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  return found;
}

export const canSweep = () => location.protocol !== "https:";
