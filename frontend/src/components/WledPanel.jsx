import React, { useState } from "react";
import { api } from "../api.js";

const DIR_LABEL = {
  panel_follows_wled: "Panel follows lights",
  wled_follows_panel: "Lights follow panel",
  mirror: "Mirror both ways",
};

export default function WledPanel({ wled, onOpenSettings, onChanged, onToast }) {
  const [busy, setBusy] = useState(false);

  async function toggle(enabled) {
    setBusy(true);
    try {
      await api.configureWled({ enabled }); // URL/direction come from Settings
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

      {!wled.base_url ? (
        <p className="muted">
          Add your WLED address in{" "}
          <button className="linklike" onClick={onOpenSettings}>
            Settings → WLED
          </button>
          .
        </p>
      ) : (
        <>
          <p className="muted small">
            {wled.base_url} · {DIR_LABEL[wled.direction] || wled.direction}
          </p>
          <div className="actions">
            {wled.enabled ? (
              <button onClick={() => toggle(false)} disabled={busy}>
                Stop syncing
              </button>
            ) : (
              <button className="primary" onClick={() => toggle(true)} disabled={busy}>
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
        </>
      )}
    </div>
  );
}
