import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const DIRECTIONS = [
  { value: "panel_follows_wled", label: "Panel follows lights" },
  { value: "wled_follows_panel", label: "Lights follow panel" },
  { value: "mirror", label: "Mirror both ways" },
];

export default function WledPanel({ wled, onChanged, onToast }) {
  const [url, setUrl] = useState(wled.base_url || "");
  const [direction, setDirection] = useState(
    wled.direction || "panel_follows_wled"
  );
  const [busy, setBusy] = useState(false);

  // Keep local fields in sync if the backend state changes elsewhere.
  useEffect(() => {
    setUrl(wled.base_url || "");
    setDirection(wled.direction || "panel_follows_wled");
  }, [wled.base_url, wled.direction]);

  async function apply(enabled) {
    setBusy(true);
    try {
      await api.configureWled({ enabled, base_url: url, direction });
      onChanged();
      onToast(enabled ? "WLED sync on" : "WLED sync off");
    } catch (e) {
      onToast(`Error: ${e.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wled-panel">
      <h3>💡 WLED sync</h3>

      <div className="control">
        <label>WLED address</label>
        <input
          type="text"
          placeholder="http://192.168.1.60"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <div className="control">
        <label>Direction</label>
        <select value={direction} onChange={(e) => setDirection(e.target.value)}>
          {DIRECTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="actions">
        {wled.enabled ? (
          <button onClick={() => apply(false)} disabled={busy}>
            Stop syncing
          </button>
        ) : (
          <button
            className="primary"
            onClick={() => apply(true)}
            disabled={busy || !url}
          >
            Start syncing
          </button>
        )}
      </div>

      <div className="wled-status">
        {wled.error && <p className="err">⚠ {wled.error}</p>}
        {wled.enabled && !wled.error && (
          <p>
            Lights: <strong>{wled.wled_on ? "on" : "off"}</strong> · Panel:{" "}
            <strong>{wled.panel_active ? "on" : "off"}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
