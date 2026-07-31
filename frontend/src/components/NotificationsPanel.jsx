import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";

// Configure and test the notification pop-ups. Any connected service (Discord,
// game servers, the browser extension) can POST /api/notifications; here you set
// whether they show, for how long, which sources are muted, and can fire a test.
export default function NotificationsPanel({ onToast }) {
  const [state, setState] = useState(null);
  const [custom, setCustom] = useState({
    title: "",
    message: "",
    source: "manual",
    duration: "",
    color: "#5b8cff",
  });

  const load = useCallback(async () => {
    try {
      setState(await api.notifications());
    } catch (e) {
      onToast(`Couldn't load notifications: ${e.message}`, true);
    }
  }, [onToast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const patch = async (p) => {
    try {
      const cfg = await api.updateNotifSettings(p);
      setState((s) => (s ? { ...s, settings: cfg } : s));
    } catch (e) {
      onToast(`Save failed: ${e.message}`, true);
    }
  };

  const cfg = state?.settings;
  const muted = new Set(cfg?.muted_sources || []);

  const toggleMute = (src) => {
    const next = new Set(muted);
    next.has(src) ? next.delete(src) : next.add(src);
    patch({ muted_sources: [...next] });
  };

  const sendCustom = async () => {
    if (!custom.title && !custom.message) {
      onToast("Enter a title or message", true);
      return;
    }
    try {
      await api.pushNotification({
        title: custom.title,
        message: custom.message,
        source: custom.source || "manual",
        color: custom.color,
        duration: custom.duration ? Number(custom.duration) : undefined,
      });
      onToast("Sent to the panel");
    } catch (e) {
      onToast(`Send failed: ${e.message}`, true);
    }
  };

  if (!cfg) return <div className="settings-section"><p className="muted">Loading…</p></div>;

  const sources = state.sources_seen || [];

  return (
    <div className="settings-section">
      <h3>Notifications</h3>
      <p className="settings-hint">
        Pop-ups that slide in over whatever's on the panel, then disappear. Any
        connected service can raise one.
      </p>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        Enable notifications
      </label>

      <div className="control">
        <label>Default duration (seconds)</label>
        <input
          type="number"
          min="1"
          max="120"
          value={cfg.default_duration}
          onChange={(e) => patch({ default_duration: Number(e.target.value) })}
        />
      </div>

      <div className="actions">
        <button className="primary" onClick={() => api.testNotification().then(() => onToast("Test sent"))}>
          Send test
        </button>
        <button onClick={() => api.clearNotifications().then(() => onToast("Cleared"))}>
          Clear current
        </button>
      </div>

      {sources.length > 0 && (
        <>
          <h4 className="sub">Sources</h4>
          <p className="field-hint">Uncheck a source to mute its notifications.</p>
          {sources.map((src) => (
            <label key={src} className="checkbox">
              <input
                type="checkbox"
                checked={!muted.has(src)}
                onChange={() => toggleMute(src)}
              />
              {src}
            </label>
          ))}
        </>
      )}

      <h4 className="sub">Send a custom one</h4>
      <div className="control">
        <label>Title</label>
        <input
          type="text"
          value={custom.title}
          onChange={(e) => setCustom({ ...custom, title: e.target.value })}
          placeholder="Server online"
        />
      </div>
      <div className="control">
        <label>Message</label>
        <input
          type="text"
          value={custom.message}
          onChange={(e) => setCustom({ ...custom, message: e.target.value })}
          placeholder="Valheim · 2/10 players"
        />
      </div>
      <div className="row-2">
        <div className="control">
          <label>Source tag</label>
          <input
            type="text"
            value={custom.source}
            onChange={(e) => setCustom({ ...custom, source: e.target.value })}
          />
        </div>
        <div className="control">
          <label>Accent</label>
          <input
            type="color"
            value={custom.color}
            onChange={(e) => setCustom({ ...custom, color: e.target.value })}
          />
        </div>
      </div>
      <div className="actions">
        <button className="primary" onClick={sendCustom}>Send to panel</button>
      </div>

      {state.history?.length > 0 && (
        <>
          <h4 className="sub">Recent</h4>
          <ul className="notif-history">
            {state.history.slice(0, 8).map((n, i) => (
              <li key={i}>
                <span className="dot" style={{ background: n.color }} />
                <b>{n.title || n.source}</b>
                {n.message ? ` — ${n.message}` : ""}
                <span className="src">{n.source}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="field-hint">
        Services POST to <code>/api/notifications</code> with a title, message,
        source, and optional duration/color/priority — that's how a Discord bot or
        game-server monitor will feed this.
      </p>
    </div>
  );
}
