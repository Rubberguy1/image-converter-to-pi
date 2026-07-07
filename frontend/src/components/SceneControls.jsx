import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import CropModal from "./CropModal.jsx";

export const MUSIC_PROVIDERS = [
  { v: "lastfm", l: "Last.fm" },
  { v: "plex", l: "Plex" },
  { v: "vlc", l: "VLC" },
  { v: "none", l: "Off" },
];

// Left-pane controls for the scene: background, add widgets, per-widget config,
// weather location, and save/enable. Shares state via the `sc` scene hook object.
export default function SceneControls({ sc, cols, rows, media, music, fonts }) {
  const [weather, setWeather] = useState({ lat: 0, lon: 0, unit: "fahrenheit" });
  const [cropWidget, setCropWidget] = useState(null);
  const [sceneName, setSceneName] = useState("");

  useEffect(() => {
    api
      .getSettings()
      .then((s) =>
        setWeather({ lat: s.weather_lat ?? 0, lon: s.weather_lon ?? 0, unit: s.weather_unit || "fahrenheit" })
      )
      .catch(() => {});
  }, []);

  const { scene } = sc;
  const sel = scene.widgets.find((w) => w.id === sc.selId) || null;
  const fontList = fonts && fonts.length ? fonts : [{ name: "5x7", height: 7 }];
  const selFontH = (fontList.find((f) => f.name === (sel?.config?.font || "5x7")) || {}).height || 7;

  return (
    <>
    <div className="scene-controls">
      <h3>🎛 Scene</h3>
      <div className="actions">
        <button
          className="primary"
          onClick={() =>
            sc.save({
              weather_lat: Number(weather.lat),
              weather_lon: Number(weather.lon),
              weather_unit: weather.unit,
            })
          }
        >
          Save
        </button>
        <button onClick={sc.toggle}>{scene.enabled ? "Turn off" : "Show on panel"}</button>
      </div>

      <div className="settings-section">
        <h4>Background</h4>
        <div className="control">
          <label>Type</label>
          <select
            value={scene.background.type}
            onChange={(e) => sc.setBackground({ type: e.target.value })}
          >
            <option value="none">None (black)</option>
            <option value="color">Solid color</option>
            <option value="media">Image / GIF</option>
          </select>
        </div>
        {scene.background.type === "color" && (
          <div className="control">
            <label>Color</label>
            <input
              type="color"
              value={scene.background.color}
              onChange={(e) => sc.setBackground({ color: e.target.value })}
            />
          </div>
        )}
        {scene.background.type === "media" && (
          <div className="control">
            <label>Media</label>
            <select
              value={scene.background.media_id || ""}
              onChange={(e) => sc.setBackground({ media_id: e.target.value || null })}
            >
              <option value="">— pick —</option>
              {(media || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h4>Add widget</h4>
        <div className="widget-add">
          <button onClick={() => sc.addWidget("image", cols, rows)}>🖼 Image</button>
          <button onClick={() => sc.addWidget("clock", cols, rows)}>🕐 Clock</button>
          <button onClick={() => sc.addWidget("text", cols, rows)}>T Text</button>
          <button onClick={() => sc.addWidget("weather", cols, rows)}>☀ Weather</button>
          <button onClick={() => sc.addWidget("value", cols, rows)}># Value</button>
          <button onClick={() => sc.addWidget("music", cols, rows)}>💿 Album art</button>
          <button onClick={() => sc.addWidget("nowplaying", cols, rows)}>♪ Now playing</button>
        </div>
        <p className="field-hint">Or click a library image below to drop it in.</p>
      </div>

      {sel && (
        <div className="settings-section">
          <h4>{sel.type} widget</h4>
          {sel.type === "clock" && (
            <div className="control">
              <label>Format</label>
              <select
                value={sel.config.format}
                onChange={(e) => sc.updateConfig(sel.id, { format: e.target.value })}
              >
                <option value="%H:%M">24h HH:MM</option>
                <option value="%H:%M:%S">24h HH:MM:SS</option>
                <option value="%I:%M">12h HH:MM</option>
                <option value="%I:%M %p">12h HH:MM AM</option>
              </select>
            </div>
          )}
          {sel.type === "text" && (
            <div className="control">
              <label>Text</label>
              <input
                type="text"
                value={sel.config.text || ""}
                onChange={(e) => sc.updateConfig(sel.id, { text: e.target.value })}
              />
            </div>
          )}
          {sel.type === "value" && (
            <>
              <div className="control">
                <label>Value name (e.g. battery)</label>
                <input
                  type="text"
                  value={sel.config.name || ""}
                  onChange={(e) => sc.updateConfig(sel.id, { name: e.target.value })}
                />
              </div>
              <div className="control">
                <label>Label / suffix</label>
                <div className="row2">
                  <input
                    type="text"
                    placeholder="label"
                    value={sel.config.label || ""}
                    onChange={(e) => sc.updateConfig(sel.id, { label: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="suffix"
                    value={sel.config.suffix || ""}
                    onChange={(e) => sc.updateConfig(sel.id, { suffix: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}
          {sel.type === "weather" && (
            <p className="field-hint">Set your location in the Weather box below.</p>
          )}
          {sel.type === "image" && (
            <>
              <div className="control">
                <label>Image</label>
                <select
                  value={sel.config.media_id || ""}
                  onChange={(e) => sc.updateConfig(sel.id, { media_id: e.target.value || null })}
                >
                  <option value="">— pick —</option>
                  {(media || []).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="control">
                <label>Size (w × h)</label>
                <div className="row2">
                  <input type="number" min="1" max={cols} value={sel.config.w || cols}
                    onChange={(e) => sc.updateConfig(sel.id, { w: Number(e.target.value) })} />
                  <input type="number" min="1" max={rows} value={sel.config.h || rows}
                    onChange={(e) => sc.updateConfig(sel.id, { h: Number(e.target.value) })} />
                </div>
              </div>
              <div className="control">
                <label>Fit</label>
                <select value={sel.config.fit || "cover"}
                  onChange={(e) => {
                    const fit = e.target.value;
                    const patch = { fit };
                    if (fit === "center" || fit === "integer") {
                      const item = (media || []).find((m) => m.id === sel.config.media_id);
                      const zoom = fit === "integer" ? Math.max(1, sel.config.zoom || 1) : 1;
                      patch.off_x = Math.round(((sel.config.w || 0) - (item?.width || 0) * zoom) / 2);
                      patch.off_y = Math.round(((sel.config.h || 0) - (item?.height || 0) * zoom) / 2);
                    }
                    sc.updateConfig(sel.id, patch);
                  }}>
                  <option value="cover">Cover (fill, crop)</option>
                  <option value="contain">Contain (letterbox)</option>
                  <option value="center">Native 1:1 (viewport)</option>
                  <option value="integer">Integer zoom (viewport)</option>
                  <option value="stretch">Stretch</option>
                </select>
              </div>
              {(sel.config.fit === "center" || sel.config.fit === "integer") && (
                <>
                  {sel.config.fit === "integer" && (
                    <div className="control">
                      <label>Zoom (×{Math.max(1, sel.config.zoom || 1)})</label>
                      <input type="number" min="1" max="16" value={sel.config.zoom || 1}
                        onChange={(e) => sc.updateConfig(sel.id, { zoom: Math.max(1, Number(e.target.value)) })} />
                    </div>
                  )}
                  <p className="field-hint">
                    Viewport: drag inside the box to pan the image, edges to move the box,
                    corners to crop. <button className="linklike" style={{ padding: 0 }}
                      onClick={() => sc.updateConfig(sel.id, { off_x: 0, off_y: 0 })}>Reset pan</button>
                  </p>
                </>
              )}
              <Slider label="Brightness" value={sel.config.brightness ?? 1}
                onChange={(v) => sc.updateConfig(sel.id, { brightness: v })} />
              <Slider label="Contrast" value={sel.config.contrast ?? 1}
                onChange={(v) => sc.updateConfig(sel.id, { contrast: v })} />
              <Slider label="Saturation" value={sel.config.saturation ?? 1} min={0}
                onChange={(v) => sc.updateConfig(sel.id, { saturation: v })} />
              <label className="checkbox">
                <input type="checkbox" checked={sel.config.nearest || false}
                  onChange={(e) => sc.updateConfig(sel.id, { nearest: e.target.checked })} />
                Crisp pixels (no smoothing)
              </label>
              <button
                onClick={() => setCropWidget(sel)}
                disabled={!sel.config.media_id}
              >
                Crop / pixel-lock…
              </button>
            </>
          )}

          {(sel.type === "music" || sel.type === "nowplaying") && (
            <>
              <div className="control">
                <label>Source (player)</label>
                <select
                  value={music?.provider || "none"}
                  onChange={(e) => music?.setProvider(e.target.value)}
                >
                  {MUSIC_PROVIDERS.map((p) => (
                    <option key={p.v} value={p.v}>{p.l}</option>
                  ))}
                </select>
              </div>
              <p className="field-hint">
                {music?.playing
                  ? `▶ ${[music.artist, music.title].filter(Boolean).join(" – ") || "playing"}`
                  : music?.provider && music.provider !== "none"
                  ? "Source on — waiting for a track…"
                  : "Pick a source to feed the widget."}
              </p>
            </>
          )}

          {sel.type === "music" && (
            <>
              <div className="control">
                <label>Size (w × h)</label>
                <div className="row2">
                  <input type="number" min="1" max={cols} value={sel.config.w || 32}
                    onChange={(e) => sc.updateConfig(sel.id, { w: Number(e.target.value) })} />
                  <input type="number" min="1" max={rows} value={sel.config.h || 32}
                    onChange={(e) => sc.updateConfig(sel.id, { h: Number(e.target.value) })} />
                </div>
              </div>
              <div className="control">
                <label>Style</label>
                <select value={sel.config.disc ? "disc" : "square"}
                  onChange={(e) => sc.updateConfig(sel.id, { disc: e.target.value === "disc" })}>
                  <option value="square">Static square</option>
                  <option value="disc">Spinning disc</option>
                </select>
              </div>
              {!sel.config.disc && (
                <div className="control">
                  <label>Art fit</label>
                  <select value={sel.config.fit || "cover"}
                    onChange={(e) => sc.updateConfig(sel.id, { fit: e.target.value })}>
                    <option value="cover">Cover (fill, crop)</option>
                    <option value="contain">Contain (letterbox)</option>
                    <option value="center">Native (1:1)</option>
                    <option value="integer">Integer zoom (crisp)</option>
                    <option value="stretch">Stretch</option>
                  </select>
                </div>
              )}
            </>
          )}

          {sel.type === "nowplaying" && (
            <label className="checkbox">
              <input type="checkbox" checked={sel.config.show_artist !== false}
                onChange={(e) => sc.updateConfig(sel.id, { show_artist: e.target.checked })} />
              Show artist (2nd line)
            </label>
          )}

          <div className="control">
            <label>Position (x, y)</label>
            <div className="row2">
              <input
                type="number"
                min="0"
                max={cols - 1}
                value={sel.x}
                onChange={(e) => sc.updateWidget(sel.id, { x: Number(e.target.value) })}
              />
              <input
                type="number"
                min="0"
                max={rows - 1}
                value={sel.y}
                onChange={(e) => sc.updateWidget(sel.id, { y: Number(e.target.value) })}
              />
            </div>
          </div>
          {sel.type !== "image" && sel.type !== "music" && (
            <>
              <div className="control">
                <label>Text box (w × h)</label>
                <div className="row2">
                  <input type="number" min="6" max={cols} value={sel.config?.w || 60}
                    onChange={(e) => sc.updateConfig(sel.id, { w: Number(e.target.value) })} />
                  <input type="number" min="6" max={rows} value={sel.config?.h || 12}
                    onChange={(e) => sc.updateConfig(sel.id, { h: Number(e.target.value) })} />
                </div>
                <p className="field-hint">Resize the box to wrap/clip; font size is separate.</p>
              </div>
              {fontList.length > 1 && (
                <div className="control">
                  <label>Font</label>
                  <select
                    value={sel.config?.font || "5x7"}
                    onChange={(e) => {
                      const fh = (fontList.find((f) => f.name === e.target.value) || {}).height || 7;
                      const scale = Math.max(1, Math.round((sel.size || fh) / selFontH));
                      // keep the same visual scale when switching fonts
                      sc.updateConfig(sel.id, { font: e.target.value });
                      sc.updateWidget(sel.id, { size: scale * fh });
                    }}
                  >
                    {fontList.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name} ({f.height}px)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="control">
                <label>
                  Font size / color / align{" "}
                  <span className="val">×{Math.max(1, Math.round((sel.size || selFontH) / selFontH))}</span>
                </label>
                <div className="row3">
                  <input
                    type="number"
                    min={selFontH}
                    max={selFontH * 8}
                    step={selFontH}
                    value={sel.size}
                    onChange={(e) => {
                      const scale = Math.max(1, Math.round(Number(e.target.value) / selFontH));
                      sc.updateWidget(sel.id, { size: scale * selFontH });
                    }}
                  />
                  <input
                    type="color"
                    value={sel.color}
                    onChange={(e) => sc.updateWidget(sel.id, { color: e.target.value })}
                  />
                  <select
                    value={sel.align}
                    onChange={(e) => sc.updateWidget(sel.id, { align: e.target.value })}
                  >
                    <option value="left">L</option>
                    <option value="center">C</option>
                    <option value="right">R</option>
                  </select>
                </div>
              </div>
            </>
          )}
          <button onClick={() => sc.removeWidget(sel.id)}>Remove {sel.type}</button>
        </div>
      )}

      <div className="settings-section">
        <h4>Weather location</h4>
        <p className="field-hint">Free (Open-Meteo, no key). Enter your lat/lon.</p>
        <div className="control">
          <div className="row3">
            <input
              type="number"
              step="0.0001"
              placeholder="lat"
              value={weather.lat}
              onChange={(e) => setWeather((w) => ({ ...w, lat: e.target.value }))}
            />
            <input
              type="number"
              step="0.0001"
              placeholder="lon"
              value={weather.lon}
              onChange={(e) => setWeather((w) => ({ ...w, lon: e.target.value }))}
            />
            <select
              value={weather.unit}
              onChange={(e) => setWeather((w) => ({ ...w, unit: e.target.value }))}
            >
              <option value="fahrenheit">°F</option>
              <option value="celsius">°C</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h4>Saved scenes</h4>
        <div className="control">
          <div className="row2">
            <input
              type="text"
              placeholder="name"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
            />
            <button
              className="primary"
              disabled={!sceneName.trim()}
              onClick={() => {
                sc.saveAs(sceneName.trim());
                setSceneName("");
              }}
            >
              Save as…
            </button>
          </div>
        </div>
        {sc.saved.length === 0 && <p className="field-hint">No saved scenes yet.</p>}
        {sc.saved.map((name) => (
          <div className="saved-row" key={name}>
            <button className="linklike" onClick={() => sc.loadNamed(name)}>
              {name}
            </button>
            <button className="tiny-x" title="Delete" onClick={() => sc.deleteNamed(name)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>

    {cropWidget && (() => {
      const item = (media || []).find((m) => m.id === cropWidget.config.media_id);
      if (!item) return null;
      return (
        <CropModal
          item={item}
          config={cropWidget.config}
          onApply={(patch) => sc.updateConfig(cropWidget.id, patch)}
          onClose={() => setCropWidget(null)}
        />
      );
    })()}
    </>
  );
}

function Slider({ label, value, min = 0.1, max = 3, onChange }) {
  return (
    <div className="control">
      <label>
        {label} <span className="val">{Number(value).toFixed(2)}×</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step="0.05"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
