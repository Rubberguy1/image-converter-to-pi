const ext = globalThis.browser ?? globalThis.chrome;

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

function setStatus(msg, cls) {
  statusEl.textContent = msg;
  statusEl.className = cls || "";
}

async function load() {
  const d = await ext.storage.local.get(["baseUrl", "enabled"]);
  $("baseUrl").value = d.baseUrl || "";
  $("enabled").checked = d.enabled !== false;
}

async function save() {
  const baseUrl = $("baseUrl").value.trim();
  await ext.storage.local.set({ baseUrl, enabled: $("enabled").checked });
  setStatus("Saved.", "ok");
}

async function test() {
  const baseUrl = $("baseUrl").value.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    setStatus("Enter the Pi address first.", "err");
    return;
  }
  setStatus("Testing…");
  try {
    const r = await fetch(baseUrl + "/api/status");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    if (d.app === "pixel-pusher" || d.matrix) {
      setStatus(`Connected to ${d.name || "Pixel Pusher"} ✓`, "ok");
    } else {
      setStatus("Reached a server, but it doesn't look like Pixel Pusher.", "err");
    }
  } catch (e) {
    setStatus("Could not reach it: " + e.message, "err");
  }
}

$("save").addEventListener("click", save);
$("test").addEventListener("click", test);
load();
