import React from "react";

const ICON = { clock: "🕐", text: "T", weather: "☀", value: "#", image: "🖼", music: "💿", nowplaying: "♪" };

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
        <h4>Preview</h4>
        <div className="preview-box" style={{ "--panel-aspect": cols / rows }}>
          <span className="preview-label">
            {cols}×{rows} · {sc.scene.enabled ? "showing on panel" : "not shown"}
          </span>
          {sc.previewUrl ? (
            <img className="panel-preview" src={sc.previewUrl} alt="scene preview" />
          ) : (
            <div className="panel-preview placeholder" style={{ "--panel-aspect": cols / rows }}>
              …
            </div>
          )}
        </div>
      </div>

      <div className="settings-section">
        <h4>Layers</h4>
        {layers.length === 0 && <p className="field-hint">No items yet.</p>}
        {layers.map((w) => (
          <div
            key={w.id}
            className={`layer-row ${w.id === sc.selId ? "sel" : ""} ${w.hidden ? "hidden" : ""}`}
            onClick={() => sc.setSelId(w.id)}
          >
            <span className="layer-icon">{ICON[w.type] || "?"}</span>
            <span className="layer-name" title={layerLabel(w, media)}>
              {layerLabel(w, media)}
            </span>
            <button
              className="layer-btn"
              title="Bring forward"
              onClick={(e) => {
                e.stopPropagation();
                sc.moveWidget(w.id, "forward");
              }}
            >
              ▲
            </button>
            <button
              className="layer-btn"
              title="Send backward"
              onClick={(e) => {
                e.stopPropagation();
                sc.moveWidget(w.id, "backward");
              }}
            >
              ▼
            </button>
            <button
              className="layer-btn"
              title={w.hidden ? "Show" : "Hide"}
              onClick={(e) => {
                e.stopPropagation();
                sc.toggleHidden(w.id);
              }}
            >
              {w.hidden ? "🚫" : "👁"}
            </button>
            <button
              className="layer-btn danger"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                sc.removeWidget(w.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <div className="layer-row bg" title="Background (always at the back)">
          <span className="layer-icon">▦</span>
          <span className="layer-name">Background — {bgLabel}</span>
        </div>
      </div>
    </aside>
  );
}
