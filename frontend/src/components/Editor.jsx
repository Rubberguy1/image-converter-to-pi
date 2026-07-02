import React, { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { api } from "../api.js";
import Resizer, { clamp } from "./Resizer.jsx";

// Build the settings payload sent to the backend.
function buildSettings(useCrop, area, fit, color) {
  return {
    fit,
    crop:
      useCrop && area
        ? {
            x: Math.max(0, area.x / 100),
            y: Math.max(0, area.y / 100),
            w: Math.min(1, area.width / 100),
            h: Math.min(1, area.height / 100),
          }
        : null,
    brightness: color.brightness,
    contrast: color.contrast,
    saturation: color.saturation,
  };
}

export default function Editor({ item, onPushed, onToast, pwmBits, panelAspect, gridCols, gridRows }) {
  // Crop to the panel's shape so the selection maps 1:1 to the display.
  const aspect = panelAspect && panelAspect > 0 ? panelAspect : 1;
  const cols = gridCols || 64;
  const rows = gridRows || 64;

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPercent, setAreaPercent] = useState(null);
  const [useCrop, setUseCrop] = useState(Boolean(item.settings.crop));
  const [pixelGrid, setPixelGrid] = useState(false);
  const [fit, setFit] = useState(item.settings.fit || "cover");
  const [color, setColor] = useState({
    brightness: item.settings.brightness ?? 1,
    contrast: item.settings.contrast ?? 1,
    saturation: item.settings.saturation ?? 1,
  });
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const previewTimer = useRef(null);

  // Resizable right panel (persisted).
  const [panelWidth, setPanelWidth] = useState(
    () => Number(localStorage.getItem("pp.rightWidth")) || 340
  );
  useEffect(() => {
    localStorage.setItem("pp.rightWidth", panelWidth);
  }, [panelWidth]);

  // Reset local state when a different item is selected.
  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setAreaPercent(null);
    setUseCrop(Boolean(item.settings.crop));
    setFit(item.settings.fit || "cover");
    setColor({
      brightness: item.settings.brightness ?? 1,
      contrast: item.settings.contrast ?? 1,
      saturation: item.settings.saturation ?? 1,
    });
  }, [item.id]);

  const settings = buildSettings(useCrop, areaPercent, fit, color);

  // Debounced live preview whenever settings change.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const url = await api.previewUrl(item.id, settings);
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
      } catch {
        /* ignore transient preview errors */
      }
    }, 250);
    return () => clearTimeout(previewTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, useCrop, areaPercent, fit, color.brightness, color.contrast, color.saturation, pwmBits]);

  const onCropComplete = useCallback((_area) => setAreaPercent(_area), []);

  async function push() {
    setBusy(true);
    try {
      const res = await api.display(item.id, settings);
      onToast(
        res.music_disabled
          ? `Pushed "${item.name}" — music sync turned off`
          : `Pushed "${item.name}" to the panel`
      );
      onPushed && onPushed();
    } catch (e) {
      onToast(`Error: ${e.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    try {
      await api.saveSettings(item.id, settings);
      onToast("Settings saved");
      onPushed && onPushed();
    } catch (e) {
      onToast(`Error: ${e.message}`, true);
    }
  }

  return (
    <div className="editor">
      <div className="editor-main">
        <div className="editor-head">
          <h2>{item.name}</h2>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={useCrop}
              onChange={(e) => setUseCrop(e.target.checked)}
            />
            Crop to a region
          </label>
          {useCrop && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={pixelGrid}
                onChange={(e) => setPixelGrid(e.target.checked)}
              />
              Pixel grid ({cols}×{rows})
            </label>
          )}
        </div>

        <div
          className={`crop-area ${useCrop ? "" : "static"}`}
          style={{ "--panel-aspect": aspect }}
        >
          {useCrop ? (
            <>
              <Cropper
                image={api.originalUrl(item.id)}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                minZoom={1}
                maxZoom={12}
                zoomSpeed={0.15}
                restrictPosition={true}
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
              {pixelGrid && (
                <div
                  className="pixel-grid"
                  style={{
                    backgroundSize: `calc(100% / ${cols}) calc(100% / ${rows})`,
                  }}
                />
              )}
            </>
          ) : (
            <img src={api.originalUrl(item.id)} alt={item.name} />
          )}
        </div>

        {useCrop && (
          <>
            <div className="control zoom-control">
              <label>
                Zoom <span className="val">{zoom.toFixed(1)}×</span>
              </label>
              <input
                type="range"
                min="1"
                max="12"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </div>
            <p className="hint">Scroll to zoom · drag to pan</p>
          </>
        )}
      </div>

      <Resizer
        onDrag={(x) => setPanelWidth(clamp(window.innerWidth - x, 280, 560))}
      />

      <aside className="settings-col" style={{ width: panelWidth }}>
        <div className="preview-box">
          <span className="preview-label">Panel preview</span>
          {previewUrl ? (
            <img className="panel-preview" src={previewUrl} alt="preview" />
          ) : (
            <div className="panel-preview placeholder">…</div>
          )}
          {item.animated && <span className="badge">GIF · animated</span>}
          {pwmBits < 11 && (
            <span className="badge depth">simulating {pwmBits}-bit color</span>
          )}
        </div>

        <div className="control">
          <label>Fit mode</label>
          <select value={fit} onChange={(e) => setFit(e.target.value)}>
            <option value="cover">Cover (fill, crop overflow)</option>
            <option value="contain">Contain (letterbox, scale to fit)</option>
            <option value="center">Native (1:1, centered — no scaling)</option>
            <option value="integer">Integer zoom (crisp pixels)</option>
            <option value="stretch">Stretch</option>
          </select>
        </div>

        <Slider
          label="Brightness"
          value={color.brightness}
          min={0.1}
          max={3}
          onChange={(v) => setColor((c) => ({ ...c, brightness: v }))}
        />
        <Slider
          label="Contrast"
          value={color.contrast}
          min={0.1}
          max={3}
          onChange={(v) => setColor((c) => ({ ...c, contrast: v }))}
        />
        <Slider
          label="Saturation"
          value={color.saturation}
          min={0}
          max={3}
          onChange={(v) => setColor((c) => ({ ...c, saturation: v }))}
        />

        <div className="actions">
          <button className="primary" onClick={push} disabled={busy}>
            {busy ? "Pushing…" : "▶ Push to panel"}
          </button>
          <button onClick={save}>Save settings</button>
        </div>
      </aside>
    </div>
  );
}

function Slider({ label, value, min, max, onChange }) {
  return (
    <div className="control">
      <label>
        {label} <span className="val">{value.toFixed(2)}×</span>
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
