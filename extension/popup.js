const ext = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

async function refresh() {
  const d = await ext.storage.local.get(["baseUrl", "enabled"]);
  const enabled = d.enabled !== false;
  $("enabled").checked = enabled;
  $("pi").textContent = d.baseUrl ? d.baseUrl : "Not configured — open Settings";
  $("dot").className = enabled && d.baseUrl ? "on" : "";
  $("state").textContent = !d.baseUrl
    ? "Set the Pi address"
    : enabled
    ? "Sending what's playing"
    : "Paused";
}

$("enabled").addEventListener("change", async (e) => {
  await ext.storage.local.set({ enabled: e.target.checked });
  refresh();
});

$("opts").addEventListener("click", () => ext.runtime.openOptionsPage());

refresh();
