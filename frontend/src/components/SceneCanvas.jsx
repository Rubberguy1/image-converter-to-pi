import React, { useEffect, useRef, useState } from "react";
import { clamp } from "./Resizer.jsx";
import { MUSIC_PROVIDERS } from "./SceneControls.jsx";

const ICON = { clock: "🕐", text: "T", weather: "☀", value: "#", image: "🖼", music: "💿", nowplaying: "♪" };
const CORNERS = ["nw", "ne", "sw", "se"];
const EDGES = ["n", "s", "w", "e"];
// Tiles hold scaling art (aspect-lockable). Text widgets hold a text box that
// the text wraps/clips within — resizing changes the box, never the font size.
const isTile = (w) => w.type === "image" || w.type === "music";
// Viewport image: the box is a fixed window; the interior image pans, the box
// crops. Only image widgets in the non-scaling fit modes.
const isWindowed = (w) => w.type === "image" && (w.config?.fit === "center" || w.config?.fit === "integer");

// Every widget now carries an explicit w×h box. `def` supplies a fallback for
// older text widgets that don't have one stored yet.
function widgetBox(w, def) {
  const cw = w.config?.w;
  const ch = w.config?.h;
  return { x: w.x, y: w.y, w: Math.max(1, cw || def.w), h: Math.max(1, ch || def.h) };
}

// The center edit area: a live server-rendered preview of the scene with the
// pixel grid, per-widget selection boxes, corner resize handles, and a
// right-click context menu.
export default function SceneCanvas({ sc, cols, rows, music, media }) {
  const ref = useRef(null);
  const [uniform, setUniform] = useState(true);
  const [menu, setMenu] = useState(null); // { x, y, id }

  const boxOf = (w) =>
    widgetBox(w, { w: Math.max(8, cols - w.x), h: Math.max(8, rows - w.y) });

  const sel = sc.scene.widgets.find((w) => w.id === sc.selId) || null;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const key = (e) => e.key === "Escape" && setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
    };
  }, [menu]);

  function grid(ev, rect) {
    return [((ev.clientX - rect.left) / rect.width) * cols, ((ev.clientY - rect.top) / rect.height) * rows];
  }

  // Drag the whole box to move the widget (free positioning for every type).
  function startMove(e, w) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu(null);
    sc.setSelId(w.id);
    const rect = ref.current.getBoundingClientRect();
    const kx = cols / rect.width;
    const ky = rows / rect.height;
    const ox = e.clientX;
    const oy = e.clientY;
    const sx = w.x;
    const sy = w.y;
    const box = boxOf(w);
    const move = (ev) => {
      const nx = Math.round(sx + (ev.clientX - ox) * kx);
      const ny = Math.round(sy + (ev.clientY - oy) * ky);
      sc.updateWidget(w.id, {
        x: clamp(nx, -Math.round(box.w) + 1, cols - 1),
        y: clamp(ny, -Math.round(box.h) + 1, rows - 1),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Drag a corner handle to resize. Images honor the uniform/free toggle;
  // widgets always scale uniformly (only their font size changes).
  function startResize(e, w, corner) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu(null);
    sc.setSelId(w.id);
    const rect = ref.current.getBoundingClientRect();
    const win = isWindowed(w);
    const tile = isTile(w);
    const lockAspect = tile && !win ? uniform : false; // text + viewports resize freely
    const b0 = boxOf(w);
    const aspect = b0.w / b0.h;
    // For a viewport, keep the image pinned to the panel so resizing only crops:
    // panel anchor of the image = box origin + pan offset.
    const anchorX = b0.x + (w.config?.off_x || 0);
    const anchorY = b0.y + (w.config?.off_y || 0);
    const fixed = {
      nw: { x: b0.x + b0.w, y: b0.y + b0.h },
      ne: { x: b0.x, y: b0.y + b0.h },
      sw: { x: b0.x + b0.w, y: b0.y },
      se: { x: b0.x, y: b0.y },
    }[corner];

    const move = (ev) => {
      const [cx, cy] = grid(ev, rect);
      let bw = Math.abs(cx - fixed.x);
      let bh = Math.abs(cy - fixed.y);
      if (lockAspect && aspect > 0) {
        if (bw / aspect > bh) bh = bw / aspect;
        else bw = bh * aspect;
      }
      bw = Math.max(tile ? 1 : 6, bw);
      bh = Math.max(tile ? 1 : 6, bh);
      const bx = cx < fixed.x ? fixed.x - bw : fixed.x;
      const by = cy < fixed.y ? fixed.y - bh : fixed.y;
      if (win) {
        sc.updateWidget(w.id, { x: Math.round(bx), y: Math.round(by) });
        sc.updateConfig(w.id, {
          w: Math.max(1, Math.round(bw)),
          h: Math.max(1, Math.round(bh)),
          off_x: Math.round(anchorX - bx),
          off_y: Math.round(anchorY - by),
        });
      } else {
        applyBox(w, { x: bx, y: by, w: bw, h: bh });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Pan the image inside a viewport box (interior drag) — the box stays put.
  function startPan(e, w) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu(null);
    sc.setSelId(w.id);
    const rect = ref.current.getBoundingClientRect();
    const kx = cols / rect.width;
    const ky = rows / rect.height;
    const ox = e.clientX;
    const oy = e.clientY;
    const sox = w.config?.off_x || 0;
    const soy = w.config?.off_y || 0;
    const move = (ev) => {
      sc.updateConfig(w.id, {
        off_x: Math.round(sox + (ev.clientX - ox) * kx),
        off_y: Math.round(soy + (ev.clientY - oy) * ky),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Interior drag: pan for viewport images, move the box for everything else.
  function startBody(e, w) {
    if (isWindowed(w)) startPan(e, w);
    else startMove(e, w);
  }

  function applyBox(w, box) {
    // Resizing only changes the box boundary — never the font size. For text
    // widgets the text re-wraps inside the new box (and clips) server-side.
    sc.updateWidget(w.id, { x: Math.round(box.x), y: Math.round(box.y) });
    sc.updateConfig(w.id, {
      w: Math.max(1, Math.round(box.w)),
      h: Math.max(1, Math.round(box.h)),
    });
  }

  // Switch an image's fit. Entering a viewport mode centers the image in the box.
  function setFit(w, fit) {
    const patch = { fit };
    if (fit === "center" || fit === "integer") {
      const item = (media || []).find((m) => m.id === w.config?.media_id);
      const zoom = fit === "integer" ? Math.max(1, w.config?.zoom || 1) : 1;
      const iw = (item?.width || w.config?.w || 0) * zoom;
      const ih = (item?.height || w.config?.h || 0) * zoom;
      patch.off_x = Math.round(((w.config?.w || 0) - iw) / 2);
      patch.off_y = Math.round(((w.config?.h || 0) - ih) / 2);
    }
    sc.updateConfig(w.id, patch);
  }

  function openMenu(e, w) {
    e.preventDefault();
    e.stopPropagation();
    sc.setSelId(w.id);
    const rect = ref.current.getBoundingClientRect();
    setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: w.id });
  }

  const menuWidget = menu && sc.scene.widgets.find((w) => w.id === menu.id);

  return (
    <div className="scene-workspace">
      <div className="editor-head">
        <h2>Scene</h2>
        <label className="checkbox" title="Lock aspect ratio when resizing images / album art">
          <input
            type="checkbox"
            checked={uniform}
            onChange={(e) => setUniform(e.target.checked)}
          />
          Uniform scale
        </label>
        <span className="muted small">
          {cols}×{rows} · {sc.scene.enabled ? "showing" : "not shown"} · drag to move · right-click for options
        </span>
      </div>
      <div className="scene-canvas" ref={ref} style={{ "--panel-aspect": cols / rows }}>
        {sc.previewUrl && <img className="scene-bg" src={sc.previewUrl} alt="scene" />}
        <div
          className="pixel-grid"
          style={{ backgroundSize: `calc(100% / ${cols}) calc(100% / ${rows})` }}
        />
        {sc.scene.widgets.map((w) => {
          const box = boxOf(w);
          const isSel = w.id === sc.selId;
          return (
            <div
              key={w.id}
              className={`scene-box ${isSel ? "sel" : ""} ${w.hidden ? "hidden" : ""} ${
                isWindowed(w) ? "windowed" : ""
              }`}
              style={{
                left: `${(box.x / cols) * 100}%`,
                top: `${(box.y / rows) * 100}%`,
                width: `${(box.w / cols) * 100}%`,
                height: `${(box.h / rows) * 100}%`,
              }}
              onPointerDown={(e) => startBody(e, w)}
              onContextMenu={(e) => openMenu(e, w)}
              title={isWindowed(w) ? "drag to pan · edges move · corners crop" : `${w.type} (${w.x},${w.y})`}
            >
              <span className="box-badge">{ICON[w.type] || "?"}</span>
              {isSel && isWindowed(w) &&
                EDGES.map((edge) => (
                  <span
                    key={edge}
                    className={`edge ${edge}`}
                    title="move box"
                    onPointerDown={(e) => startMove(e, w)}
                  />
                ))}
              {isSel &&
                CORNERS.map((c) => (
                  <span
                    key={c}
                    className={`handle ${c}`}
                    onPointerDown={(e) => startResize(e, w, c)}
                  />
                ))}
            </div>
          );
        })}

        {menu && menuWidget && (
          <ul
            className="scene-context-menu"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isTile(menuWidget) && (
              <>
                <li className="menu-head">Scaling</li>
                <li onClick={() => { setFit(menuWidget, "cover"); setMenu(null); }}>
                  Fill{menuWidget.config?.fit === "cover" ? " ✓" : ""}
                </li>
                <li onClick={() => { setFit(menuWidget, "integer"); setMenu(null); }}>
                  Integer scale{menuWidget.config?.fit === "integer" ? " ✓" : ""}
                </li>
                <li onClick={() => { setFit(menuWidget, "center"); setMenu(null); }}>
                  1:1 (native){menuWidget.config?.fit === "center" ? " ✓" : ""}
                </li>
                <li className="menu-sep" />
              </>
            )}
            {(menuWidget.type === "music" || menuWidget.type === "nowplaying") && music && (
              <>
                <li className="menu-head">Source (player)</li>
                {MUSIC_PROVIDERS.map((p) => (
                  <li
                    key={p.v}
                    onClick={() => {
                      music.setProvider(p.v);
                      setMenu(null);
                    }}
                  >
                    {p.l}
                    {music.provider === p.v ? " ✓" : ""}
                  </li>
                ))}
                <li className="menu-sep" />
              </>
            )}
            <li className="menu-head">Layer</li>
            <li onClick={() => { sc.moveWidget(menuWidget.id, "front"); setMenu(null); }}>
              Bring to front
            </li>
            <li onClick={() => { sc.moveWidget(menuWidget.id, "forward"); setMenu(null); }}>
              Bring forward
            </li>
            <li onClick={() => { sc.moveWidget(menuWidget.id, "backward"); setMenu(null); }}>
              Send backward
            </li>
            <li onClick={() => { sc.moveWidget(menuWidget.id, "back"); setMenu(null); }}>
              Send to back
            </li>
            <li className="menu-sep" />
            <li onClick={() => { sc.toggleHidden(menuWidget.id); setMenu(null); }}>
              {menuWidget.hidden ? "Show" : "Hide"}
            </li>
            <li
              className="danger"
              onClick={() => {
                sc.removeWidget(menuWidget.id);
                setMenu(null);
              }}
            >
              Remove {menuWidget.type}
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
