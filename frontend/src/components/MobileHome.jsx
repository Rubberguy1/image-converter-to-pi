import React, { useState } from "react";
import Icon from "./Icon.jsx";
import HeaderDropdown from "./HeaderDropdown.jsx";
import MusicPanel from "./MusicPanel.jsx";
import WledPanel from "./WledPanel.jsx";
import ScreenMirror from "./ScreenMirror.jsx";
import { api } from "../api.js";

// The mobile landing tab: a glanceable dashboard — what's on the wall right now,
// brightness, and quick access to the live-sync panels.
export default function MobileHome({ sc, status, dims, onToast, onChanged, goEditor, goScenes }) {
  const enabled = sc.scene.enabled;
  const [bright, setBright] = useState(status.matrix.brightness ?? 70);
  const setBrightness = (v) => {
    setBright(v);
    api.setBrightness(v).catch(() => {});
  };
  const mirrorActive = status.now_showing?.source === "live";

  return (
    <div className="mhome">
      <div className="mhome-greet">
        <div>
          <div className="mhome-hi">
            Hi{status.name ? `, ${status.name}` : ""}
          </div>
          <div className="muted small">
            {status.matrix.width}×{status.matrix.height} panel · {status.power?.max_watts ?? "?"} W max
          </div>
        </div>
        <button className="round-btn" onClick={goScenes} aria-label="Saved scenes">
          <Icon name="grid" size={20} />
        </button>
      </div>

      <div className="card mhome-panel">
        <div className="mhome-onair">
          <span className={`onair-dot ${enabled ? "live" : ""}`} aria-hidden="true" />
          {enabled ? "On air" : "Off"}
          <span className="muted small mhome-dims">{dims.cols}×{dims.rows}</span>
        </div>
        <div className="mhome-preview">
          {sc.previewUrl ? (
            <img src={sc.previewUrl} alt="live panel" />
          ) : (
            <div className="placeholder">…</div>
          )}
        </div>
        <div className="mhome-actions">
          <button className="primary" onClick={goEditor}>
            <Icon name="edit" size={16} /> Edit scene
          </button>
          <button className={enabled ? "" : "primary"} onClick={sc.toggle}>
            {enabled ? "Turn off" : "Show on panel"}
          </button>
        </div>
      </div>

      <div className="card mhome-bright">
        <label>Brightness</label>
        <input
          type="range"
          min="1"
          max="100"
          value={bright}
          onChange={(e) => setBrightness(Number(e.target.value))}
          aria-label="Panel brightness"
        />
        <span className="mono">{bright}%</span>
      </div>

      <div className="mhome-tiles">
        <HeaderDropdown
          label={<><Icon name="music" size={16} /> Music</>}
          title="Music sync"
          badge={status.music.enabled}
        >
          <MusicPanel music={status.music} onChanged={onChanged} onToast={onToast} />
        </HeaderDropdown>
        {status.wled && (
          <HeaderDropdown
            label={<><Icon name="power" size={16} /> WLED</>}
            title="WLED sync"
            badge={status.wled.enabled}
          >
            <WledPanel wled={status.wled} onChanged={onChanged} onToast={onToast} />
          </HeaderDropdown>
        )}
        <HeaderDropdown
          label={<><Icon name="play" size={16} /> Mirror</>}
          title="Screen mirror"
          badge={mirrorActive}
        >
          <ScreenMirror cols={dims.cols} rows={dims.rows} onChanged={onChanged} onToast={onToast} />
        </HeaderDropdown>
      </div>
    </div>
  );
}
