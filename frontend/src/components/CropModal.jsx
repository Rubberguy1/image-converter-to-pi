import React, { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import PixelCropper from "./PixelCropper.jsx";
import { api } from "../api.js";

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function cropFromPixels(px, srcW, srcH) {
  if (!px || !srcW || !srcH) return null;
  return {
    x: clamp01(px.x / srcW),
    y: clamp01(px.y / srcH),
    w: clamp01(px.width / srcW),
    h: clamp01(px.height / srcH),
  };
}

// Crop / pixel-lock an image widget's source. Produces { crop | window, fit }.
export default function CropModal({ item, config, onApply, onClose }) {
  const w = config.w;
  const h = config.h;
  const aspect = w / h;

  const [pixelLock, setPixelLock] = useState(Boolean(config.window));
  const [fit, setFit] = useState(config.fit || "cover");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState(null);
  const [lockedWindow, setLockedWindow] = useState(config.window || null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const timer = useRef(null);

  const cropRegion = pixelLock ? null : cropFromPixels(areaPixels, item.width, item.height);
  const settings = {
    fit: pixelLock ? "center" : fit,
    crop: cropRegion,
    window: pixelLock ? lockedWindow : null,
    brightness: config.brightness ?? 1,
    contrast: config.contrast ?? 1,
    saturation: config.saturation ?? 1,
    nearest: pixelLock ? true : config.nearest ?? false,
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const url = await api.mediaTilePreviewUrl(item.id, settings, w, h);
        setPreviewUrl((o) => {
          if (o) URL.revokeObjectURL(o);
          return url;
        });
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelLock, fit, areaPixels, lockedWindow]);

  const onCropComplete = useCallback((_p, px) => setAreaPixels(px), []);

  function apply() {
    onApply({
      fit: pixelLock ? "center" : fit,
      crop: pixelLock ? null : cropRegion,
      window: pixelLock ? lockedWindow : null,
      nearest: pixelLock ? true : config.nearest ?? false,
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Crop image</h2>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={pixelLock} onChange={(e) => setPixelLock(e.target.checked)} />
          Lock to tile pixels ({w}×{h}, 1:1)
        </label>

        <div className="crop-area" style={{ "--panel-aspect": aspect }}>
          {pixelLock ? (
            <PixelCropper
              imageUrl={api.originalUrl(item.id)}
              srcW={item.width}
              srcH={item.height}
              cols={w}
              rows={h}
              onChange={setLockedWindow}
            />
          ) : (
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
              style={{ mediaStyle: { imageRendering: "pixelated" } }}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>
        <p className="hint">
          {pixelLock ? "Drag to move · locked 1:1" : "Scroll to zoom · drag to pan"}
        </p>

        {!pixelLock && (
          <div className="control">
            <label>Fit</label>
            <select value={fit} onChange={(e) => setFit(e.target.value)}>
              <option value="cover">Cover (fill, crop)</option>
              <option value="contain">Contain (letterbox)</option>
              <option value="center">Native (1:1)</option>
              <option value="integer">Integer zoom (crisp)</option>
              <option value="stretch">Stretch</option>
            </select>
          </div>
        )}

        <div className="preview-box" style={{ "--panel-aspect": aspect }}>
          <span className="preview-label">Tile preview ({w}×{h})</span>
          {previewUrl && <img className="panel-preview" src={previewUrl} alt="tile" />}
        </div>

        <div className="actions modal-actions">
          <button className="primary" onClick={apply}>Apply</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
