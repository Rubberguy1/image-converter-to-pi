import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";

// Monitor Steam / Source game servers (A2S query) and raise notifications when
// they go up/down (and optionally on player join/leave).
export default function GameServersPanel({ onToast }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ name: "", host: "", query_port: "" });
  const [testing, setTesting] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.gameServers());
    } catch (e) {
      onToast(`Couldn't load servers: ${e.message}`, true);
    }
  }, [onToast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const cfg = data?.settings;

  const patchSettings = async (p) => {
    try {
      const s = await api.updateGsSettings(p);
      setData((d) => (d ? { ...d, settings: s } : d));
    } catch (e) {
      onToast(`Save failed: ${e.message}`, true);
    }
  };

  const addServer = async () => {
    if (!form.host || !form.query_port) {
      onToast("Host and query port are required", true);
      return;
    }
    try {
      await api.addGameServer({
        name: form.name,
        host: form.host,
        query_port: Number(form.query_port),
      });
      setForm({ name: "", host: "", query_port: "" });
      load();
    } catch (e) {
      onToast(`Add failed: ${e.message}`, true);
    }
  };

  const testServer = async (id) => {
    setTesting(id);
    try {
      const r = await api.testGameServer(id);
      onToast(
        r.ok
          ? `${r.srv_name || "OK"} · ${r.map || "?"} · ${r.players}/${r.max}`
          : `Query failed: ${r.error}`,
        !r.ok
      );
    } catch (e) {
      onToast(`Test failed: ${e.message}`, true);
    } finally {
      setTesting(null);
    }
  };

  const removeServer = async (id) => {
    try {
      await api.removeGameServer(id);
      load();
    } catch (e) {
      onToast(`Remove failed: ${e.message}`, true);
    }
  };

  if (!data) return <div className="settings-section"><p className="muted">Loading…</p></div>;

  const servers = data.servers || [];

  return (
    <div className="settings-section">
      <h3>Game servers</h3>
      <p className="settings-hint">
        Watches Steam/Source servers (A2S query) and pops a notification when one
        comes up, goes down, or players change. Point it at each server's host and
        <b> query port</b>.
      </p>

      {!data.available && (
        <p className="err small">
          ⚠ The A2S library isn't installed yet — update the Pi
          (<code>update.sh</code>) so <code>python-a2s</code> gets installed.
        </p>
      )}

      {servers.length > 0 && (
        <ul className="server-list">
          {servers.map((s) => {
            const st = s.state || {};
            const dot = st.online === true ? "on" : st.online === false ? "off" : "";
            return (
              <li key={s.id}>
                <span className={`dot ${dot}`} />
                <div className="srv-main">
                  <b>{s.name}</b>{" "}
                  {st.online === true && (
                    <span className="srv-meta">{st.players}/{st.max} · {st.map}</span>
                  )}
                  {st.online === false && <span className="srv-meta off">offline</span>}
                  {st.online == null && <span className="srv-meta">…</span>}
                  <div className="srv-addr">{s.host}:{s.query_port}</div>
                </div>
                <div className="srv-actions">
                  <button onClick={() => testServer(s.id)} disabled={testing === s.id}>
                    {testing === s.id ? "…" : "Test"}
                  </button>
                  <label className="checkbox inline" title="Monitor this server">
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={(e) => api.updateGameServer(s.id, { enabled: e.target.checked }).then(load)}
                    />
                  </label>
                  <button className="danger" onClick={() => removeServer(s.id)}>✕</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h4 className="sub">Add a server</h4>
      <div className="control">
        <label>Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Valheim"
        />
      </div>
      <div className="row-2">
        <div className="control" style={{ flex: 2 }}>
          <label>Host / IP</label>
          <input
            type="text"
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            placeholder="192.168.1.218"
          />
        </div>
        <div className="control">
          <label>Query port</label>
          <input
            type="number"
            value={form.query_port}
            onChange={(e) => setForm({ ...form, query_port: e.target.value })}
            placeholder="2457"
          />
        </div>
      </div>
      <p className="field-hint">
        The <b>query</b> port, not always the game port — e.g. Valheim = game port
        + 1 (2457), most Source games use the game port itself.
      </p>
      <div className="actions">
        <button className="primary" onClick={addServer}>Add server</button>
      </div>

      <h4 className="sub">Alerts</h4>
      <div className="control">
        <label>Check every (seconds)</label>
        <input
          type="number"
          min="5"
          value={cfg.poll_seconds}
          onChange={(e) => patchSettings({ poll_seconds: Number(e.target.value) })}
        />
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={cfg.notify_online}
          onChange={(e) => patchSettings({ notify_online: e.target.checked })} />
        Notify when a server comes online
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={cfg.notify_offline}
          onChange={(e) => patchSettings({ notify_offline: e.target.checked })} />
        Notify when a server goes offline
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={cfg.notify_join}
          onChange={(e) => patchSettings({ notify_join: e.target.checked })} />
        Notify when a player joins
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={cfg.notify_leave}
          onChange={(e) => patchSettings({ notify_leave: e.target.checked })} />
        Notify when a player leaves
      </label>
    </div>
  );
}
