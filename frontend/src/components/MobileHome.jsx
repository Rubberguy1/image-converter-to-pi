import React, { useState } from "react";
import Icon from "./Icon.jsx";
import RangeInput from "./RangeInput.jsx";
import HeaderDropdown from "./HeaderDropdown.jsx";
import MusicPanel from "./MusicPanel.jsx";
import { api } from "../api.js";

// The product IS a lit LED panel, so the logo is one: a small tile with an amber
// "signal" running across its dot-matrix.
function Brandmark() {
  const lit = new Set(["0,2", "1,1", "2,0"]); // amber diagonal streak
  const dots = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      dots.push(
        <circle
          key={`${c},${r}`}
          cx={7 + c * 5}
          cy={7 + r * 5}
          r="1.7"
          fill="var(--accent)"
          opacity={lit.has(`${c},${r}`) ? 1 : 0.28}
        />
      );
    }
  }
  return (
    <svg className="brandmark" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="var(--panel-2)" stroke="var(--border)" />
      {dots}
    </svg>
  );
}

// The mobile landing tab: brand header, then a glanceable panel status card,
// brightness, and music sync.
export default function MobileHome({ sc, status, dims, onToast, onChanged, goEditor }) {
  const enabled = sc.scene.enabled;
  const [bright, setBright] = useState(status.matrix.brightness ?? 70);
  const setBrightness = (v) => {
    setBright(v);
    api.setBrightness(v).catch(() => {});
  };

  return (
    <div className="mhome">
      <header className="mhome-head">
        <Brandmark />
        <h1 className="brand-word">
          Pixel<span>Pusher</span>
        </h1>
        {status.power && (
          <span className="brand-stat mono" title="Panel size · estimated peak draw">
            {status.matrix.width}×{status.matrix.height}
            <em>{status.power.max_watts}W</em>
          </span>
        )}
      </header>

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
        <RangeInput
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
      </div>
    </div>
  );
}
