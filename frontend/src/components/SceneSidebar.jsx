import React from "react";
import Icon from "./Icon.jsx";

function layerLabel(w, media) {
  if (w.type === "image") {
    const m = (media || []).find((x) => x.id === w.config?.media_id);
    return m ? m.name : "image";
  }
  if (w.type === "text") return w.config?.text || "text";
  if (w.type === "value") return w.config?.name || "value";
  if (w.type === "music") return w.config?.disc ? "spinning disc" : "album art";
  if (w.type === "nowplaying") return "now playing";
  return w.type;
}

// Right pane: a clean scene preview plus a layer list. Layers are shown
// top-to-bottom in draw order (topmost first) and can be reordered, hidden,
// selected, or deleted.
export default function SceneSidebar({ sc, cols, rows, media }) {
  const layers = [...sc.scene.widgets].reverse(); // topmost first
  const bg = sc.scene.background;
  const bgLabel =
    bg.type === "color"
      ? `Color ${bg.color}`
      : bg.type === "media"
      ? "Image / GIF"
      : "None (black)";

  return (
    <aside className="scene-sidebar">
      <div className="settings-section">
        <h4>Layers</h4>
        {layers.length === 0 && <p className="field-hint">No items yet.</p>}
        {layers.map((w) => (
          <div
            key={w.id}
            role="button"
            tabIndex={0}
            aria-current={w.id === sc.selId ? "true" : undefined}
            aria-label={`${layerLabel(w, media)} layer${w.hidden ? ", hidden" : ""}${
              w.id === sc.selId ? ", selected" : ""
            }`}
            className={`layer-row ${w.id === sc.selId ? "sel" : ""} ${w.hidden ? "hidden" : ""}`}
            onClick={() => sc.setSelId(w.id)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                sc.setSelId(w.id);
              }
            }}
          >
            <span className="layer-icon" aria-hidden="true"><Icon name={w.type} size={14} /></span>
            <span className="layer-name" title={layerLabel(w, media)}>
              {layerLabel(w, media)}
            </span>
            <button
              className="layer-btn"
              title="Bring forward"
              aria-label={`Bring ${layerLabel(w, media)} forward`}
              onClick={(e) => {
                e.stopPropagation();
                sc.moveWidget(w.id, "forward");
              }}
            >
              <Icon name="chevronUp" size={14} />
            </button>
            <button
              className="layer-btn"
              title="Send backward"
              aria-label={`Send ${layerLabel(w, media)} backward`}
              onClick={(e) => {
                e.stopPropagation();
                sc.moveWidget(w.id, "backward");
              }}
            >
              <Icon name="chevronDown" size={14} />
            </button>
            <button
              className="layer-btn"
              title={w.hidden ? "Show" : "Hide"}
              aria-label={`${w.hidden ? "Show" : "Hide"} ${layerLabel(w, media)}`}
              aria-pressed={Boolean(w.hidden)}
              onClick={(e) => {
                e.stopPropagation();
                sc.toggleHidden(w.id);
              }}
            >
              <Icon name={w.hidden ? "eyeOff" : "eye"} size={14} />
            </button>
            <button
              className="layer-btn danger"
              title="Delete"
              aria-label={`Delete ${layerLabel(w, media)}`}
              onClick={(e) => {
                e.stopPropagation();
                sc.removeWidget(w.id);
              }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
        <div className="layer-row bg" title="Background (always at the back)">
          <span className="layer-icon" aria-hidden="true"><Icon name="layers" size={14} /></span>
          <span className="layer-name">Background — {bgLabel}</span>
        </div>
      </div>
    </aside>
  );
}
