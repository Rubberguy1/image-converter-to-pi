import React, { useState } from "react";
import { api } from "../api.js";

const PROVIDERS = [
  { value: "none", label: "Off" },
  { value: "lastfm", label: "Last.fm (universal — YouTube Music, etc.)" },
  { value: "plex", label: "Plex" },
  { value: "vlc", label: "VLC" },
];

export default function MusicPanel({ music, onChanged, onToast }) {
  const [provider, setProvider] = useState(music.provider || "none");
  const [busy, setBusy] = useState(false);

  async function apply(enabled, prov = provider, spin = null) {
    setBusy(true);
    try {
      await api.configureMusic(prov, enabled, spin);
      onChanged();
      if (spin === null) {
        onToast(enabled ? `Music sync on (${prov})` : "Music sync off");
      } else {
        onToast(spin ? "Spin effect on" : "Spin effect off");
      }
    } catch (e) {
      onToast(`Error: ${e.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="music-panel">
      <h3>🎵 Music sync</h3>
      <div className="control">
        <label>Source</label>
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            if (music.enabled) apply(e.target.value !== "none", e.target.value);
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={Boolean(music.spin)}
          onChange={(e) => apply(music.enabled, provider, e.target.checked)}
        />
        💿 Spin album art like a CD
      </label>

      <div className="actions">
        {music.enabled ? (
          <button onClick={() => apply(false)} disabled={busy}>
            Stop syncing
          </button>
        ) : (
          <button
            className="primary"
            onClick={() => apply(true)}
            disabled={busy || provider === "none"}
          >
            Start syncing
          </button>
        )}
      </div>

      {music.enabled && music.playing && music.owns_panel && (
        <div className="preview-box">
          <span className="preview-label">Live panel (64×64)</span>
          <img
            className="panel-preview"
            // key changes per track / spin toggle so the GIF reloads; it then
            // loops on its own, mirroring the panel.
            src={`/api/display/current?k=${encodeURIComponent(
              `${music.title}|${music.album}|${music.spin}`
            )}`}
            alt="live panel"
          />
        </div>
      )}

      <div className="music-status">
        {music.error && <p className="err">⚠ {music.error}</p>}
        {music.enabled && (
          <p>
            {music.playing ? (
              <>
                ♫ <strong>{music.title}</strong>
                {music.artist ? ` — ${music.artist}` : ""}
                {music.owns_panel ? " (on panel)" : ""}
              </>
            ) : (
              "Waiting for playback…"
            )}
          </p>
        )}
      </div>
    </div>
  );
}
