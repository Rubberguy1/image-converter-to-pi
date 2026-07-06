import React, { useEffect, useState } from "react";
import { api } from "../api.js";

// Left-pane controls for the scene: background, add widgets, per-widget config,
// weather location, and save/enable. Shares state via the `sc` scene hook object.
export default function SceneControls({ sc, cols, rows, media }) {
  const [weather, setWeather] = useState({ lat: 0, lon: 0, unit: "fahrenheit" });

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

  return (
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
                  onChange={(e) => sc.updateConfig(sel.id, { fit: e.target.value })}>
                  <option value="cover">Cover (fill, crop)</option>
                  <option value="contain">Contain (letterbox)</option>
                  <option value="center">Native (1:1)</option>
                  <option value="integer">Integer zoom (crisp)</option>
                  <option value="stretch">Stretch</option>
                </select>
              </div>
            </>
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
          {sel.type !== "image" && (
            <div className="control">
              <label>Size / color / align</label>
              <div className="row3">
                <input
                  type="number"
                  min="4"
                  max="48"
                  value={sel.size}
                  onChange={(e) => sc.updateWidget(sel.id, { size: Number(e.target.value) })}
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
    </div>
  );
}
