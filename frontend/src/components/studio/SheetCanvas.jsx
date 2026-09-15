import React, { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../Icon.jsx";
import { newId, regionBounds } from "./spriteGeom.js";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 32;
const HANDLE = 7; // px, screen space
const ACCENT = "#ffb62e";
const ACCENT_INK = "#17130a";
const TEXT = "#f3efe4";
const MUTED = "rgba(139,147,166,0.7)";
const GREEN = "#33d6a6";

// The zoomable, pannable sheet. Two tools:
//   Regions — drag on empty sheet to draw a crop region; drag a region to move
//             it; drag its corner handles to resize; arrows nudge; Delete removes.
//   Frames  — click any frame (cell) to append it to the selected clip.
// Wheel zooms around the cursor; middle-drag or Space+drag pans.
export default function SheetCanvas({
  src,
  sheetId,
  sheetW,
  sheetH,
  regions,        // only this sheet's regions
  frames: allFrames, // every frame of the sprite (global numbering); filtered to this sheet here
  selRegionId,
  onSelectRegion,
  onChangeRegion,
  onAddRegion,
  onDeleteRegion,
  tool,
  onTool,
  clipFrames, // indices in the selected clip (for highlighting)
  onPickFrame,
  hasClip,
}) {
  const wrapRef = useRef(null);
  const cvRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // sheet-space coords at the top-left of the view
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [space, setSpace] = useState(false);
  const [hover, setHover] = useState(null); // frame index under the cursor
  const drag = useRef(null);
  const frames = (allFrames || []).filter((f) => !sheetId || f.sheet === sheetId);
  const stateRef = useRef({});
  stateRef.current = { zoom, pan, regions, selRegionId, tool, size, frames };
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;

  // --- coordinate helpers ---
  const toScreen = useCallback((x, y) => [(x - pan.x) * zoom, (y - pan.y) * zoom], [pan, zoom]);
  const toSheet = (sx, sy) => {
    const { zoom: z, pan: p } = stateRef.current;
    return [sx / z + p.x, sy / z + p.y];
  };
  const eventPos = (e) => {
    const rect = cvRef.current.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  // --- fit / zoom ---
  const fit = useCallback(() => {
    const { size: s } = stateRef.current;
    if (!sheetW || !sheetH) return;
    const k = Math.min((s.w - 24) / sheetW, (s.h - 24) / sheetH);
    const z = k >= 1 ? Math.max(1, Math.floor(k)) : Math.max(MIN_ZOOM, k);
    setZoom(z);
    setPan({ x: (sheetW - s.w / z) / 2, y: (sheetH - s.h / z) / 2 });
  }, [sheetW, sheetH]);

  const zoomAt = (factor, sx, sy) => {
    const { zoom: z, pan: p, size: s } = stateRef.current;
    const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
    if (nz === z) return;
    const cx = sx ?? s.w / 2;
    const cy = sy ?? s.h / 2;
    // keep the sheet point under the cursor fixed
    const [wx, wy] = [cx / z + p.x, cy / z + p.y];
    setZoom(nz);
    setPan({ x: wx - cx / nz, y: wy - cy / nz });
  };

  // Size the canvas to its container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  // Fit when a sheet first loads or the selected sheet changes.
  useEffect(() => {
    if (src) fit();
  }, [src, sheetId, fit]);

  // Wheel zoom needs a non-passive listener to prevent page scroll.
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const [sx, sy] = eventPos(e);
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, sx, sy);
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, []);

  // Space = pan modifier while the canvas has focus.
  useEffect(() => {
    const down = (e) => {
      if (e.code === "Space" && document.activeElement === cvRef.current) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // --- hit testing ---
  const handleAt = (sx, sy) => {
    const { regions: rs, selRegionId: sel } = stateRef.current;
    const r = rs.find((x) => x.id === sel);
    if (!r) return null;
    const b = regionBounds(r);
    const [x0, y0] = toScreen(b.x, b.y);
    const [x1, y1] = toScreen(b.x + b.w, b.y + b.h);
    const pts = { nw: [x0, y0], ne: [x1, y0], sw: [x0, y1], se: [x1, y1] };
    for (const [k, [hx, hy]] of Object.entries(pts)) {
      if (Math.abs(sx - hx) <= HANDLE && Math.abs(sy - hy) <= HANDLE) return k;
    }
    return null;
  };
  const regionAt = (wx, wy) => {
    const { regions: rs } = stateRef.current;
    for (let i = rs.length - 1; i >= 0; i--) {
      const b = regionBounds(rs[i]);
      if (wx >= b.x && wx < b.x + b.w && wy >= b.y && wy < b.y + b.h) return rs[i];
    }
    return null;
  };
  const frameAt = (wx, wy) => {
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      if (wx >= f.x && wx < f.x + f.w && wy >= f.y && wy < f.y + f.h) return f;
    }
    return null;
  };

  // --- pointer interaction ---
  const onPointerDown = (e) => {
    const cv = cvRef.current;
    cv.focus();
    const [sx, sy] = eventPos(e);
    const [wx, wy] = toSheet(sx, sy);
    const { zoom: z, pan: p, tool: t } = stateRef.current;

    if (e.button === 1 || space || e.button === 2) {
      e.preventDefault();
      drag.current = { kind: "pan", sx, sy, pan: p };
      cv.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    if (t === "frames") {
      const f = frameAt(wx, wy);
      if (f && onPickFrame) onPickFrame(f.index);
      return;
    }

    // Regions tool.
    const h = handleAt(sx, sy);
    if (h) {
      const r = regions.find((x) => x.id === selRegionId);
      drag.current = { kind: "resize", handle: h, start: { ...r }, bounds: regionBounds(r) };
      cv.setPointerCapture(e.pointerId);
      return;
    }
    const r = regionAt(wx, wy);
    if (r) {
      onSelectRegion(r.id);
      drag.current = { kind: "move", id: r.id, wx, wy, rx: r.x, ry: r.y };
      cv.setPointerCapture(e.pointerId);
      return;
    }
    // Rubber-band a new region.
    onSelectRegion(null);
    drag.current = { kind: "new", wx: Math.floor(wx), wy: Math.floor(wy), cur: null };
    cv.setPointerCapture(e.pointerId);
    void z;
  };

  const onPointerMove = (e) => {
    const [sx, sy] = eventPos(e);
    const [wx, wy] = toSheet(sx, sy);
    const d = drag.current;
    if (!d) {
      if (tool === "frames") {
        const f = frameAt(wx, wy);
        setHover(f ? f.index : null);
      } else if (hover !== null) setHover(null);
      return;
    }
    const { zoom: z } = stateRef.current;
    if (d.kind === "pan") {
      setPan({ x: d.pan.x - (sx - d.sx) / z, y: d.pan.y - (sy - d.sy) / z });
    } else if (d.kind === "move") {
      const nx = Math.round(d.rx + (wx - d.wx));
      const ny = Math.round(d.ry + (wy - d.wy));
      onChangeRegion(d.id, {
        x: Math.max(0, Math.min(sheetW - 1, nx)),
        y: Math.max(0, Math.min(sheetH - 1, ny)),
      });
    } else if (d.kind === "resize") {
      // Resize the single cell size (w/h); the repeat grid follows. Corner
      // handles on the outer bounds map back to a per-cell size.
      const s = d.start;
      const cols = Math.max(1, s.cols | 0);
      const rows = Math.max(1, s.rows | 0);
      const gx = s.gap_x | 0;
      const gy = s.gap_y | 0;
      const b = d.bounds;
      let left = b.x;
      let top = b.y;
      let right = b.x + b.w;
      let bottom = b.y + b.h;
      if (d.handle.includes("w")) left = Math.round(wx);
      if (d.handle.includes("e")) right = Math.round(wx);
      if (d.handle.includes("n")) top = Math.round(wy);
      if (d.handle.includes("s")) bottom = Math.round(wy);
      const bw = Math.max(cols, right - left);
      const bh = Math.max(rows, bottom - top);
      const w = Math.max(1, Math.round((bw - (cols - 1) * gx) / cols));
      const h = Math.max(1, Math.round((bh - (rows - 1) * gy) / rows));
      const patch = { w, h };
      if (d.handle.includes("w")) patch.x = Math.max(0, right - (cols * w + (cols - 1) * gx));
      if (d.handle.includes("n")) patch.y = Math.max(0, bottom - (rows * h + (rows - 1) * gy));
      onChangeRegion(s.id, patch);
    } else if (d.kind === "new") {
      d.cur = { x: Math.floor(wx), y: Math.floor(wy) };
      setHover(null);
      draw(); // live rubber band
    }
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    try {
      cvRef.current.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (d && d.kind === "new" && d.cur) {
      const x0 = Math.max(0, Math.min(d.wx, d.cur.x));
      const y0 = Math.max(0, Math.min(d.wy, d.cur.y));
      const x1 = Math.min(sheetW, Math.max(d.wx, d.cur.x) + 1);
      const y1 = Math.min(sheetH, Math.max(d.wy, d.cur.y) + 1);
      if (x1 - x0 >= 2 && y1 - y0 >= 2) {
        onAddRegion({
          id: newId(),
          name: "",
          x: x0,
          y: y0,
          w: x1 - x0,
          h: y1 - y0,
          cols: 1,
          rows: 1,
          gap_x: 0,
          gap_y: 0,
        });
      }
    }
    draw();
  };

  const onKeyDown = (e) => {
    if (tool !== "regions" || !selRegionId) return;
    const r = regions.find((x) => x.id === selRegionId);
    if (!r) return;
    const step = e.shiftKey ? 8 : 1;
    const nudge = (dx, dy) => {
      e.preventDefault();
      onChangeRegion(r.id, {
        x: Math.max(0, Math.min(sheetW - 1, r.x + dx)),
        y: Math.max(0, Math.min(sheetH - 1, r.y + dy)),
      });
    };
    if (e.key === "ArrowLeft") nudge(-step, 0);
    else if (e.key === "ArrowRight") nudge(step, 0);
    else if (e.key === "ArrowUp") nudge(0, -step);
    else if (e.key === "ArrowDown") nudge(0, step);
    else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onDeleteRegion(r.id);
    } else if (e.key === "Escape") onSelectRegion(null);
  };

  // --- drawing ---
  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const { zoom: z, pan: p, regions: rs, selRegionId: sel, tool: t, size: s, frames: fr } = stateRef.current;
    cv.width = Math.max(1, Math.round(s.w * dpr));
    cv.height = Math.max(1, Math.round(s.h * dpr));
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s.w, s.h);

    const S = (x, y) => [(x - p.x) * z, (y - p.y) * z];
    // Sheet backdrop (checker) + image.
    const [ox, oy] = S(0, 0);
    const sw = sheetW * z;
    const sh = sheetH * z;
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
    if (src) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, ox, oy, sw, sh);
    }
    ctx.strokeStyle = "#2b3242";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ox) + 0.5, Math.round(oy) + 0.5, Math.round(sw), Math.round(sh));

    // Pixel grid when zoomed in far enough.
    if (z >= 8) {
      ctx.strokeStyle = "rgba(139,147,166,0.15)";
      ctx.beginPath();
      for (let x = 0; x <= sheetW; x++) {
        const [gx] = S(x, 0);
        ctx.moveTo(Math.round(gx) + 0.5, oy);
        ctx.lineTo(Math.round(gx) + 0.5, oy + sh);
      }
      for (let y = 0; y <= sheetH; y++) {
        const [, gy] = S(0, y);
        ctx.moveTo(ox, Math.round(gy) + 0.5);
        ctx.lineTo(ox + sw, Math.round(gy) + 0.5);
      }
      ctx.stroke();
    }

    // Frames (cells) + indices; highlight the selected clip's frames.
    const inClip = new Map();
    (clipFrames || []).forEach((f, i) => {
      if (!inClip.has(f)) inClip.set(f, []);
      inClip.get(f).push(i + 1);
    });
    ctx.font = "10px ui-monospace, monospace";
    ctx.textBaseline = "top";
    for (const f of fr) {
      const [x0, y0] = S(f.x, f.y);
      const w = f.w * z;
      const h = f.h * z;
      const marked = inClip.has(f.index);
      const isHover = hover === f.index && t === "frames";
      ctx.strokeStyle = marked ? ACCENT : isHover ? GREEN : MUTED;
      ctx.lineWidth = marked || isHover ? 2 : 1;
      ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
      if (w >= 18 && h >= 12) {
        const label = marked ? `${f.index} ·${inClip.get(f.index).join(",")}` : String(f.index);
        const tw = Math.min(w - 2, ctx.measureText(label).width + 4);
        ctx.fillStyle = marked ? ACCENT : "rgba(11,13,19,0.78)";
        ctx.fillRect(Math.round(x0) + 1, Math.round(y0) + 1, tw, 12);
        ctx.fillStyle = marked ? ACCENT_INK : TEXT;
        ctx.fillText(label, Math.round(x0) + 3, Math.round(y0) + 2);
      }
    }

    // Region outlines + handles for the selection.
    for (const r of rs) {
      const b = regionBounds(r);
      const [x0, y0] = S(b.x, b.y);
      const isSel = r.id === sel;
      ctx.strokeStyle = isSel ? ACCENT : "rgba(243,239,228,0.55)";
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.setLineDash(isSel ? [] : [4, 3]);
      ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(b.w * z), Math.round(b.h * z));
      ctx.setLineDash([]);
      if (r.name && b.w * z >= 40) {
        ctx.fillStyle = isSel ? ACCENT : "rgba(243,239,228,0.85)";
        ctx.font = "600 10px system-ui, sans-serif";
        ctx.fillText(r.name, Math.round(x0) + 3, Math.round(y0) - 12);
        ctx.font = "10px ui-monospace, monospace";
      }
      if (isSel && t === "regions") {
        const pts = [[x0, y0], [x0 + b.w * z, y0], [x0, y0 + b.h * z], [x0 + b.w * z, y0 + b.h * z]];
        for (const [hx, hy] of pts) {
          ctx.fillStyle = ACCENT;
          ctx.fillRect(Math.round(hx) - 3, Math.round(hy) - 3, 7, 7);
          ctx.strokeStyle = ACCENT_INK;
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(hx) - 3 + 0.5, Math.round(hy) - 3 + 0.5, 6, 6);
        }
      }
    }

    // Rubber band for a region being drawn.
    const d = drag.current;
    if (d && d.kind === "new" && d.cur) {
      const x0 = Math.min(d.wx, d.cur.x);
      const y0 = Math.min(d.wy, d.cur.y);
      const x1 = Math.max(d.wx, d.cur.x) + 1;
      const y1 = Math.max(d.wy, d.cur.y) + 1;
      const [a, b] = S(x0, y0);
      ctx.strokeStyle = ACCENT;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(a) + 0.5, Math.round(b) + 0.5, Math.round((x1 - x0) * z), Math.round((y1 - y0) * z));
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(11,13,19,0.8)";
      const lbl = `${x1 - x0}×${y1 - y0}`;
      ctx.fillRect(a, b - 14, ctx.measureText(lbl).width + 6, 12);
      ctx.fillStyle = TEXT;
      ctx.fillText(lbl, a + 3, b - 13);
    }
  }, [src, sheetW, sheetH, clipFrames, hover, dpr]);

  useEffect(() => {
    draw();
  }, [draw, zoom, pan, regions, allFrames, sheetId, selRegionId, tool, size, clipFrames, hover, src]);

  const cursor = drag.current?.kind === "pan" || space ? "grabbing" : tool === "frames" ? "pointer" : "crosshair";

  return (
    <div className="sheet-stage">
      <div className="sheet-toolbar" role="toolbar" aria-label="Sheet tools">
        <div className="seg" role="group" aria-label="Tool">
          <button
            className={tool === "regions" ? "active" : ""}
            onClick={() => onTool("regions")}
            title="Regions: drag to draw a crop, drag to move, corners to resize (R)"
          >
            <Icon name="crop" size={14} /> Regions
          </button>
          <button
            className={tool === "frames" ? "active" : ""}
            onClick={() => onTool("frames")}
            title={hasClip ? "Frames: click frames to add them to the selected clip (F)" : "Select a clip first"}
            disabled={!hasClip}
          >
            <Icon name="film" size={14} /> Frames
          </button>
        </div>
        <span className="sheet-zoom">
          <button className="icon-btn" onClick={() => zoomAt(0.8)} title="Zoom out" aria-label="Zoom out"><Icon name="zoomOut" size={14} /></button>
          <span className="mono">{Math.round(zoom * 100)}%</span>
          <button className="icon-btn" onClick={() => zoomAt(1.25)} title="Zoom in" aria-label="Zoom in"><Icon name="zoomIn" size={14} /></button>
          <button className="icon-btn" onClick={fit} title="Fit sheet" aria-label="Fit sheet"><Icon name="fit" size={14} /></button>
          <button className="icon-btn" onClick={() => { setZoom(4); }} title="400%" aria-label="Zoom 400%"><span className="mono small">4×</span></button>
        </span>
        <span className="muted small sheet-hint">
          {tool === "regions"
            ? "drag on the sheet to crop a region · corners resize · wheel zooms · space/middle-drag pans"
            : "click frames in play order to build the clip · wheel zooms · space/middle-drag pans"}
        </span>
      </div>
      <div className="sheet-wrap" ref={wrapRef}>
        <canvas
          ref={cvRef}
          className="sheet-canvas"
          tabIndex={0}
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Sprite sheet"
        />
        {!src && <div className="sheet-empty muted">Loading sheet…</div>}
      </div>
    </div>
  );
}
