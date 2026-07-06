import React, { useRef } from "react";
import { clamp } from "./Resizer.jsx";

const ICON = { clock: "🕐", text: "T", weather: "☀", value: "#", image: "🖼" };

// The center edit area: a live server-rendered preview of the scene with the
// pixel grid and draggable widget markers.
export default function SceneCanvas({ sc, cols, rows }) {
  const ref = useRef(null);

  function startDrag(e, w) {
    e.preventDefault();
    sc.setSelId(w.id);
    const rect = ref.current.getBoundingClientRect();
    const move = (ev) => {
      const x = clamp(Math.round(((ev.clientX - rect.left) / rect.width) * cols), 0, cols - 1);
      const y = clamp(Math.round(((ev.clientY - rect.top) / rect.height) * rows), 0, rows - 1);
      sc.updateWidget(w.id, { x, y });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="scene-workspace">
      <div className="editor-head">
        <h2>Scene</h2>
        <span className="muted small">
          {cols}×{rows} · {sc.scene.enabled ? "showing on panel" : "not shown"} · drag widgets
        </span>
      </div>
      <div className="scene-canvas" ref={ref} style={{ "--panel-aspect": cols / rows }}>
        {sc.previewUrl && <img className="scene-bg" src={sc.previewUrl} alt="scene" />}
        <div
          className="pixel-grid"
          style={{ backgroundSize: `calc(100% / ${cols}) calc(100% / ${rows})` }}
        />
        {sc.scene.widgets.map((w) => (
          <div
            key={w.id}
            className={`scene-marker ${w.id === sc.selId ? "sel" : ""}`}
            style={{ left: `${(w.x / cols) * 100}%`, top: `${(w.y / rows) * 100}%` }}
            onPointerDown={(e) => startDrag(e, w)}
            title={`${w.type} (${w.x},${w.y})`}
          >
            {ICON[w.type] || "?"}
          </div>
        ))}
      </div>
    </div>
  );
}
