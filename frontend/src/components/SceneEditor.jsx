import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { clamp } from "./Resizer.jsx";

const ICON = { clock: "🕐", text: "T", weather: "☀", value: "#" };

function newWidget(type, cols, rows) {
  const id =
    (crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `w${Math.round(performance.now())}`;
  const base = { id, type, x: 2, y: 2, color: "#FFFFFF", size: Math.max(6, Math.round(rows / 8)), align: "left", config: {} };
  if (type === "clock") base.config = { format: "%H:%M" };
  if (type === "text") base.config = { text: "TEXT" };
  if (type === "value") base.config = { name: "battery", label: "", suffix: "%" };
  return base;
}

export default function SceneEditor({ cols, rows, media, onClose, onChanged, onToast }) {
  const [scene, setScene] = useState({
    enabled: false,
    background: { type: "none", color: "#000000", media_id: null, fit: "cover" },
    widgets: [],
  });
  const [selId, setSelId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [weather, setWeather] = useState({ lat: 0, lon: 0, unit: "fahrenheit" });
  const canvasRef = useRef(null);
  const previewTimer = useRef(null);

  useEffect(() => {
    api.getScene().then((r) => setScene(r.scene)).catch(() => {});
    api.getSettings().then((s) =>
      setWeather({ lat: s.weather_lat ?? 0, lon: s.weather_lon ?? 0, unit: s.weather_unit || "fahrenheit" })
    );
  }, []);

  // Debounced server-rendered preview of the (unsaved) scene.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const url = await api.scenePreviewUrl(scene);
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(previewTimer.current);
  }, [scene]);

  const sel = scene.widgets.find((w) => w.id === selId) || null;

  function updateWidget(id, patch) {
    setScene((s) => ({
      ...s,
      widgets: s.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));
  }
  function updateConfig(id, patch) {
    setScene((s) => ({
      ...s,
      widgets: s.widgets.map((w) =>
        w.id === id ? { ...w, config: { ...w.config, ...patch } } : w
      ),
    }));
  }
  function addWidget(type) {
    const w = newWidget(type, cols, rows);
    setScene((s) => ({ ...s, widgets: [...s.widgets, w] }));
    setSelId(w.id);
  }
  function removeWidget(id) {
    setScene((s) => ({ ...s, widgets: s.widgets.filter((w) => w.id !== id) }));
    if (selId === id) setSelId(null);
  }
  function setBg(patch) {
    setScene((s) => ({ ...s, background: { ...s.background, ...patch } }));
  }

  function startDrag(e, w) {
    e.preventDefault();
    setSelId(w.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const move = (ev) => {
      const x = clamp(Math.round(((ev.clientX - rect.left) / rect.width) * cols), 0, cols - 1);
      const y = clamp(Math.round(((ev.clientY - rect.top) / rect.height) * rows), 0, rows - 1);
      updateWidget(w.id, { x, y });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  async function save() {
    try {
      await api.saveScene(scene);
      await api.updateSettings({
        weather_lat: Number(weather.lat),
        weather_lon: Number(weather.lon),
        weather_unit: weather.unit,
      });
      onToast("Scene saved");
      onChanged && onChanged();
    } catch (e) {
      onToast(`Error: ${e.message}`, true);
    }
  }
  async function toggleEnabled() {
    const enabled = !scene.enabled;
    setScene((s) => ({ ...s, enabled }));
    try {
      await api.saveScene({ ...scene, enabled });
      onToast(enabled ? "Scene showing on panel" : "Scene off");
      onChanged && onChanged();
    } catch (e) {
      onToast(`Error: ${e.message}`, true);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal scene-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Scene editor</h2>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>

        <div className="scene-grid">
          {/* canvas */}
          <div className="scene-left">
            <div
              className="scene-canvas"
              ref={canvasRef}
              style={{ "--panel-aspect": cols / rows }}
            >
              {previewUrl && <img className="scene-bg" src={previewUrl} alt="scene" />}
              <div
                className="pixel-grid"
                style={{ backgroundSize: `calc(100% / ${cols}) calc(100% / ${rows})` }}
              />
              {scene.widgets.map((w) => (
                <div
                  key={w.id}
                  className={`scene-marker ${w.id === selId ? "sel" : ""}`}
                  style={{ left: `${(w.x / cols) * 100}%`, top: `${(w.y / rows) * 100}%` }}
                  onPointerDown={(e) => startDrag(e, w)}
                  title={`${w.type} (${w.x},${w.y})`}
                >
                  {ICON[w.type] || "?"}
                </div>
              ))}
            </div>
            <p className="hint">{cols}×{rows} panel · drag widgets to place them</p>
          </div>

          {/* controls */}
          <div className="scene-controls">
            <div className="actions">
              <button className="primary" onClick={save}>Save</button>
              <button onClick={toggleEnabled}>
                {scene.enabled ? "Turn off" : "Show on panel"}
              </button>
            </div>

            <div className="settings-section">
              <h3>Background</h3>
              <div className="control">
                <label>Type</label>
                <select value={scene.background.type} onChange={(e) => setBg({ type: e.target.value })}>
                  <option value="none">None (black)</option>
                  <option value="color">Solid color</option>
                  <option value="media">Image / GIF</option>
                </select>
              </div>
              {scene.background.type === "color" && (
                <div className="control">
                  <label>Color</label>
                  <input type="color" value={scene.background.color}
                    onChange={(e) => setBg({ color: e.target.value })} />
                </div>
              )}
              {scene.background.type === "media" && (
                <div className="control">
                  <label>Media</label>
                  <select value={scene.background.media_id || ""}
                    onChange={(e) => setBg({ media_id: e.target.value || null })}>
                    <option value="">— pick —</option>
                    {(media || []).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="settings-section">
              <h3>Add widget</h3>
              <div className="widget-add">
                <button onClick={() => addWidget("clock")}>🕐 Clock</button>
                <button onClick={() => addWidget("text")}>T Text</button>
                <button onClick={() => addWidget("weather")}>☀ Weather</button>
                <button onClick={() => addWidget("value")}># Value</button>
              </div>
            </div>

            {sel && (
              <div className="settings-section">
                <h3>{sel.type} widget</h3>
                {sel.type === "clock" && (
                  <div className="control">
                    <label>Format</label>
                    <select value={sel.config.format} onChange={(e) => updateConfig(sel.id, { format: e.target.value })}>
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
                    <input type="text" value={sel.config.text || ""}
                      onChange={(e) => updateConfig(sel.id, { text: e.target.value })} />
                  </div>
                )}
                {sel.type === "value" && (
                  <>
                    <div className="control">
                      <label>Value name (e.g. battery)</label>
                      <input type="text" value={sel.config.name || ""}
                        onChange={(e) => updateConfig(sel.id, { name: e.target.value })} />
                    </div>
                    <div className="control">
                      <label>Label / suffix</label>
                      <div className="row2">
                        <input type="text" placeholder="label" value={sel.config.label || ""}
                          onChange={(e) => updateConfig(sel.id, { label: e.target.value })} />
                        <input type="text" placeholder="suffix" value={sel.config.suffix || ""}
                          onChange={(e) => updateConfig(sel.id, { suffix: e.target.value })} />
                      </div>
                    </div>
                  </>
                )}
                {sel.type === "weather" && (
                  <p className="field-hint">Set your location in the Weather box below.</p>
                )}

                <div className="control">
                  <label>Position (x, y)</label>
                  <div className="row2">
                    <input type="number" min="0" max={cols - 1} value={sel.x}
                      onChange={(e) => updateWidget(sel.id, { x: Number(e.target.value) })} />
                    <input type="number" min="0" max={rows - 1} value={sel.y}
                      onChange={(e) => updateWidget(sel.id, { y: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="control">
                  <label>Size / color / align</label>
                  <div className="row3">
                    <input type="number" min="4" max="48" value={sel.size}
                      onChange={(e) => updateWidget(sel.id, { size: Number(e.target.value) })} />
                    <input type="color" value={sel.color}
                      onChange={(e) => updateWidget(sel.id, { color: e.target.value })} />
                    <select value={sel.align} onChange={(e) => updateWidget(sel.id, { align: e.target.value })}>
                      <option value="left">L</option>
                      <option value="center">C</option>
                      <option value="right">R</option>
                    </select>
                  </div>
                </div>
                <button onClick={() => removeWidget(sel.id)}>Remove widget</button>
              </div>
            )}

            <div className="settings-section">
              <h3>Weather location</h3>
              <p className="field-hint">Free (Open-Meteo, no key). Enter your lat/lon.</p>
              <div className="control">
                <div className="row3">
                  <input type="number" step="0.0001" placeholder="lat" value={weather.lat}
                    onChange={(e) => setWeather((w) => ({ ...w, lat: e.target.value }))} />
                  <input type="number" step="0.0001" placeholder="lon" value={weather.lon}
                    onChange={(e) => setWeather((w) => ({ ...w, lon: e.target.value }))} />
                  <select value={weather.unit} onChange={(e) => setWeather((w) => ({ ...w, unit: e.target.value }))}>
                    <option value="fahrenheit">°F</option>
                    <option value="celsius">°C</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
