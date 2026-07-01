import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function StatusBar({ status, onChanged, onToast }) {
  const [brightness, setBrightness] = useState(status.matrix.brightness);

  useEffect(() => {
    setBrightness(status.matrix.brightness);
  }, [status.matrix.brightness]);

  async function commitBrightness(value) {
    try {
      await api.setBrightness(value);
      onChanged();
    } catch (e) {
      onToast(`Error: ${e.message}`, true);
    }
  }

  const showing = status.now_showing;

  return (
    <div className="statusbar">
      <div className="status-left">
        <span className={`dot ${status.matrix.backend}`} />
        <span>
          {status.matrix.width}×{status.matrix.height} ·{" "}
          {status.matrix.backend === "hardware" ? "Panel" : "Emulator"}
        </span>
        <span className="now">
          {showing.source === "idle"
            ? "Idle"
            : `${showing.source === "music" ? "🎵 " : ""}${showing.label}`}
        </span>
      </div>

      <div className="status-right">
        <label>Brightness</label>
        <input
          type="range"
          min="0"
          max="100"
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          onMouseUp={(e) => commitBrightness(Number(e.target.value))}
          onTouchEnd={(e) => commitBrightness(Number(e.target.value))}
        />
        <span className="val">{brightness}%</span>
        <button onClick={() => api.stop().then(onChanged)}>⏹ Clear</button>
      </div>
    </div>
  );
}
