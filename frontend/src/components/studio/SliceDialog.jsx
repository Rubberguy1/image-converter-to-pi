import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon.jsx";
import NumInput from "./NumInput.jsx";
import { fitCount, newId, regionCells } from "./spriteGeom.js";

// Aseprite-style "Import Sprite Sheet": slice the sheet into a grid of tiles
// from an origin, tile size, column/row counts and padding, numbered by rows
// or by columns. Produces one repeated region (and optionally an idle
// animation of every frame). A live preview shows the grid on the sheet.
export default function SliceDialog({ src, sheetW, sheetH, initial, hasFrames, hasClips, onImport, onClose }) {
  const [f, setF] = useState(() => ({
    x: initial?.x ?? 0,
    y: initial?.y ?? 0,
    w: initial?.w ?? Math.min(16, sheetW),
    h: initial?.h ?? Math.min(16, sheetH),
    cols: initial?.cols ?? 1,
    rows: initial?.rows ?? 1,
    gap_x: initial?.gap_x ?? 0,
    gap_y: initial?.gap_y ?? 0,
    order: initial?.order === "cols" ? "cols" : "rows",
    name: initial?.name ?? "",
  }));
  const [replace, setReplace] = useState(true);
  const [makeIdle, setMakeIdle] = useState(!hasClips);
  const prevRef = useRef(null);
  const wrapRef = useRef(null);
  // Zoom/pan for the preview so tall or huge sheets can be inspected up close.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // sheet coords at the view's top-left
  const [size, setSize] = useState({ w: 600, h: 360 });
  const drag = useRef(null);
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 }, size: { w: 600, h: 360 } });
  viewRef.current = { zoom, pan, size };

  const set = (k, v) => setF((d) => ({ ...d, [k]: v }));
  const num = (k) => (n) => set(k, n | 0);
  const region = useMemo(
    () => ({ id: initial?.id || newId(), name: f.name, x: f.x, y: f.y, w: Math.max(1, f.w), h: Math.max(1, f.h), cols: Math.max(1, f.cols), rows: Math.max(1, f.rows), gap_x: f.gap_x, gap_y: f.gap_y, order: f.order }),
    [f, initial?.id]
  );
  const cells = useMemo(() => regionCells(region), [region]);
  const overflow = cells.some((c) => c.x + c.w > sheetW || c.y + c.h > sheetH);

  const autoCols = () => set("cols", fitCount(f.x, f.w, f.gap_x, sheetW));
  const autoRows = () => set("rows", fitCount(f.y, f.h, f.gap_y, sheetH));

  useEffect(() => {
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  // --- preview view: fit / zoom / pan ---
  const fit = useCallback(() => {
    const { size: sz } = viewRef.current;
    const k = Math.min((sz.w - 16) / sheetW, (sz.h - 16) / sheetH);
    const z = k >= 1 ? Math.max(1, Math.floor(k)) : Math.max(0.1, k);
    setZoom(z);
    setPan({ x: (sheetW - sz.w / z) / 2, y: (sheetH - sz.h / z) / 2 });
  }, [sheetW, sheetH]);
  const zoomAt = (factor, sx, sy) => {
    const { zoom: z, pan: pn, size: sz } = viewRef.current;
    const nz = Math.max(0.1, Math.min(32, z * factor));
    if (nz === z) return;
    const cx = sx ?? sz.w / 2;
    const cy = sy ?? sz.h / 2;
    const wx = cx / z + pn.x;
    const wy = cy / z + pn.y;
    setZoom(nz);
    setPan({ x: wx - cx / nz, y: wy - cy / nz });
  };
  const zoomTo = (nz) => {
    const { zoom: z, pan: pn, size: sz } = viewRef.current;
    const cx = sz.w / 2;
    const cy = sz.h / 2;
    const wx = cx / z + pn.x;
    const wy = cy / z + pn.y;
    setZoom(nz);
    setPan({ x: wx - cx / nz, y: wy - cy / nz });
  };
  const eventPos = (e) => {
    const rect = prevRef.current.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (src) fit();
  }, [src, fit]);
  useEffect(() => {
    const cv = prevRef.current;
    if (!cv) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const [sx, sy] = eventPos(e);
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, sx, sy);
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e) => {
    e.preventDefault();
    const [sx, sy] = eventPos(e);
    drag.current = { sx, sy, pan: viewRef.current.pan };
    prevRef.current.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const [sx, sy] = eventPos(e);
    const { zoom: z } = viewRef.current;
    setPan({ x: d.pan.x - (sx - d.sx) / z, y: d.pan.y - (sy - d.sy) / z });
  };
  const onPointerUp = (e) => {
    drag.current = null;
    try {
      prevRef.current.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // Live preview: the sheet with the grid overlaid, in the current view.
  useEffect(() => {
    const cv = prevRef.current;
    if (!cv || !src) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(size.w * dpr));
    cv.height = Math.max(1, Math.round(size.h * dpr));
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const S = (x, y) => [(x - pan.x) * zoom, (y - pan.y) * zoom];
    const [ox, oy] = S(0, 0);
    const sw = sheetW * zoom;
    const sh = sheetH * zoom;
    // Checker behind the sheet only, so transparent pixels read as such.
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, sw, sh);
    ctx.clip();
    const cell = 8;
    for (let y = Math.floor(oy / cell) * cell; y < oy + sh; y += cell) {
      for (let x = Math.floor(ox / cell) * cell; x < ox + sw; x += cell) {
        ctx.fillStyle = ((x / cell + y / cell) & 1) ? "#1e2432" : "#141824";
        ctx.fillRect(x, y, cell, cell);
      }
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, ox, oy, sw, sh);
    ctx.strokeStyle = "#2b3242";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ox) + 0.5, Math.round(oy) + 0.5, Math.round(sw), Math.round(sh));

    ctx.font = "10px ui-monospace, monospace";
    ctx.textBaseline = "top";
    cells.forEach((c, i) => {
      const [x0, y0] = S(c.x, c.y);
      const w = c.w * zoom;
      const h = c.h * zoom;
      // Skip cells fully outside the view (huge grids).
      if (x0 + w < 0 || y0 + h < 0 || x0 > size.w || y0 > size.h) return;
      const x = Math.round(x0) + 0.5;
      const y = Math.round(y0) + 0.5;
      const bad = c.x + c.w > sheetW || c.y + c.h > sheetH;
      ctx.strokeStyle = bad ? "#ff5d5d" : "#33d6a6";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, Math.round(w) - 1, Math.round(h) - 1);
      if (w >= 16 && h >= 12) {
        ctx.fillStyle = "rgba(11,13,19,0.75)";
        ctx.fillRect(x + 1, y + 1, Math.min(w - 2, ctx.measureText(String(i)).width + 4), 11);
        ctx.fillStyle = "#f3efe4";
        ctx.fillText(String(i), x + 3, y + 1);
      }
    });
    // Origin cross-hair.
    const [cxs, cys] = S(f.x, f.y);
    ctx.strokeStyle = "#ffb62e";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(cxs) + 0.5, 0);
    ctx.lineTo(Math.round(cxs) + 0.5, size.h);
    ctx.moveTo(0, Math.round(cys) + 0.5);
    ctx.lineTo(size.w, Math.round(cys) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [src, sheetW, sheetH, cells, f.x, f.y, zoom, pan, size]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal slice-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Slice sprite sheet">
        <div className="modal-head">
          <h2><Icon name="crop" /> Slice sprite sheet</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="modal-sub">
          {sheetW}×{sheetH}px. Set where the tiles start, their size, and how many — like Aseprite's Import Sprite Sheet.
          Frames are numbered in the preview.
        </p>

        <div className="slice-body">
          <div className="slice-stage">
            <div className="sheet-toolbar slice-toolbar" role="toolbar" aria-label="Preview view">
              <span className="sheet-zoom">
                <button className="icon-btn" onClick={() => zoomAt(0.8)} title="Zoom out" aria-label="Zoom out"><Icon name="zoomOut" size={14} /></button>
                <span className="mono">{Math.round(zoom * 100)}%</span>
                <button className="icon-btn" onClick={() => zoomAt(1.25)} title="Zoom in" aria-label="Zoom in"><Icon name="zoomIn" size={14} /></button>
                <button className="icon-btn" onClick={fit} title="Fit sheet" aria-label="Fit sheet"><Icon name="fit" size={14} /></button>
                <button className="icon-btn" onClick={() => zoomTo(1)} title="100%" aria-label="Zoom 100%"><span className="mono small">1×</span></button>
                <button className="icon-btn" onClick={() => zoomTo(4)} title="400%" aria-label="Zoom 400%"><span className="mono small">4×</span></button>
              </span>
              <span className="muted small sheet-hint">wheel zooms at the cursor · drag pans</span>
            </div>
            <div className="slice-preview" ref={wrapRef}>
              <canvas
                ref={prevRef}
                className="slice-canvas"
                aria-label="Slice preview"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
          </div>

          <div className="slice-form">
            <div className="control">
              <label>Type</label>
              <select value={f.order} onChange={(e) => set("order", e.target.value)}>
                <option value="rows">By rows (left → right, then down)</option>
                <option value="cols">By columns (top → bottom, then right)</option>
              </select>
            </div>
            <h4 className="sub">Tiles</h4>
            <div className="control">
              <label>X / Y (origin)</label>
              <div className="row2">
                <NumInput min={0} max={sheetW - 1} value={f.x} onChange={num("x")} aria-label="X" />
                <NumInput min={0} max={sheetH - 1} value={f.y} onChange={num("y")} aria-label="Y" />
              </div>
            </div>
            <div className="control">
              <label>Width / Height (one tile)</label>
              <div className="row2">
                <NumInput min={1} max={sheetW} value={f.w} onChange={num("w")} aria-label="Width" />
                <NumInput min={1} max={sheetH} value={f.h} onChange={num("h")} aria-label="Height" />
              </div>
            </div>
            <div className="control">
              <label>Columns / Rows</label>
              <div className="row2">
                <span className="with-btn">
                  <NumInput min={1} max={256} value={f.cols} onChange={num("cols")} aria-label="Columns" />
                  <button className="linklike" onClick={autoCols} title="Fit as many as the sheet holds">auto</button>
                </span>
                <span className="with-btn">
                  <NumInput min={1} max={256} value={f.rows} onChange={num("rows")} aria-label="Rows" />
                  <button className="linklike" onClick={autoRows} title="Fit as many as the sheet holds">auto</button>
                </span>
              </div>
            </div>
            <div className="control">
              <label>Padding X / Y (between tiles)</label>
              <div className="row2">
                <NumInput min={0} value={f.gap_x} onChange={num("gap_x")} aria-label="Padding X" />
                <NumInput min={0} value={f.gap_y} onChange={num("gap_y")} aria-label="Padding Y" />
              </div>
            </div>
            <div className="control">
              <label>Region name (optional)</label>
              <input type="text" value={f.name} placeholder="e.g. walk" onChange={(e) => set("name", e.target.value.slice(0, 32))} />
            </div>
            <p className={`field-hint ${overflow ? "warn-text" : ""}`}>
              {cells.length} frame{cells.length === 1 ? "" : "s"} of {f.w}×{f.h}
              {overflow ? " — some tiles run off the sheet (shown red); reduce columns/rows or adjust the origin." : "."}
            </p>
            {hasFrames && (
              <label className="checkbox">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                Replace existing regions (unchecked = add as another region)
              </label>
            )}
            <label className="checkbox">
              <input type="checkbox" checked={makeIdle} onChange={(e) => setMakeIdle(e.target.checked)} />
              Create an "idle" animation from all frames
            </label>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onImport(region, { replace: hasFrames ? replace : true, makeIdle })}>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
