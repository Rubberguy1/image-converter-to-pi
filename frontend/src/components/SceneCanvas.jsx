import React, { useEffect, useRef, useState } from "react";
import { clamp } from "./Resizer.jsx";
import { MUSIC_PROVIDERS } from "./SceneControls.jsx";
import Icon from "./Icon.jsx";

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
  const menuRef = useRef(null);

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

  // Move focus into the actions menu when it opens so it's keyboard-operable.
  useEffect(() => {
    if (menu && menuRef.current) {
      const first = menuRef.current.querySelector(".menu-item");
      if (first) first.focus();
    }
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

  // Open the same actions menu without a right-click (the ⋯ button / keyboard),
  // anchored to the widget's box so touch and keyboard users can reach it.
  function openMenuForBox(w, boxEl) {
    sc.setSelId(w.id);
    const rect = ref.current.getBoundingClientRect();
    const br = boxEl.getBoundingClientRect();
    setMenu({ x: br.left - rect.left + 6, y: br.top - rect.top + 6, id: w.id });
  }

  function closeMenu() {
    const id = menu?.id;
    setMenu(null);
    if (id && ref.current) {
      const box = ref.current.querySelector(`[data-wid="${id}"]`);
      if (box) box.focus(); // return focus to the widget after the menu closes
    }
  }

  // Keyboard on a focused widget: arrows nudge (Shift = ×10), Enter opens the
  // actions menu, Delete removes, Escape deselects.
  function onBoxKey(e, w) {
    if (e.target !== e.currentTarget) return; // ignore keys from child controls
    const step = e.shiftKey ? 10 : 1;
    const box = boxOf(w);
    const nudge = (dx, dy) => {
      e.preventDefault();
      sc.updateWidget(w.id, {
        x: clamp(w.x + dx, -Math.round(box.w) + 1, cols - 1),
        y: clamp(w.y + dy, -Math.round(box.h) + 1, rows - 1),
      });
    };
    if (e.key === "ArrowLeft") nudge(-step, 0);
    else if (e.key === "ArrowRight") nudge(step, 0);
    else if (e.key === "ArrowUp") nudge(0, -step);
    else if (e.key === "ArrowDown") nudge(0, step);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenuForBox(w, e.currentTarget);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      sc.removeWidget(w.id);
    } else if (e.key === "Escape") {
      e.currentTarget.blur();
      sc.setSelId(null);
    }
  }

  // Arrow-key roving between menu items.
  function onMenuKey(e) {
    if (e.key === "Escape") {
      closeMenu();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...menuRef.current.querySelectorAll(".menu-item")];
    const i = items.indexOf(document.activeElement);
    const next = e.key === "ArrowDown" ? i + 1 : i - 1;
    items[(next + items.length) % items.length]?.focus();
  }

  // The actions available for a widget, as a data model (rendered as a menu).
  function menuItems(w) {
    const items = [];
    if (isTile(w)) {
      items.push({ head: "Scaling" });
      items.push({ label: "Fill", on: w.config?.fit === "cover", run: () => setFit(w, "cover") });
      items.push({ label: "Integer scale", on: w.config?.fit === "integer", run: () => setFit(w, "integer") });
      items.push({ label: "1:1 (native)", on: w.config?.fit === "center", run: () => setFit(w, "center") });
      items.push({ sep: true });
    }
    if ((w.type === "music" || w.type === "nowplaying") && music) {
      items.push({ head: "Source (player)" });
      for (const p of MUSIC_PROVIDERS)
        items.push({ label: p.l, on: music.provider === p.v, run: () => music.setProvider(p.v) });
      items.push({ sep: true });
    }
    items.push({ head: "Layer" });
    items.push({ label: "Bring to front", run: () => sc.moveWidget(w.id, "front") });
    items.push({ label: "Bring forward", run: () => sc.moveWidget(w.id, "forward") });
    items.push({ label: "Send backward", run: () => sc.moveWidget(w.id, "backward") });
    items.push({ label: "Send to back", run: () => sc.moveWidget(w.id, "back") });
    items.push({ sep: true });
    items.push({ label: w.hidden ? "Show" : "Hide", run: () => sc.toggleHidden(w.id) });
    items.push({ label: `Remove ${w.type}`, danger: true, run: () => sc.removeWidget(w.id) });
    return items;
  }

  const menuWidget = menu && sc.scene.widgets.find((w) => w.id === menu.id);

  return (
    <div className="scene-workspace">
      <div className="editor-head">
        <h2>Scene</h2>
        <div className="editor-undo">
          <button
            className="icon-btn"
            onClick={sc.undo}
            disabled={!sc.canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={sc.redo}
            disabled={!sc.canRedo}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H9a5 5 0 0 0 0 10h1" />
            </svg>
          </button>
        </div>
        <label className="checkbox" title="Lock aspect ratio when resizing images / album art">
          <input
            type="checkbox"
            checked={uniform}
            onChange={(e) => setUniform(e.target.checked)}
          />
          Uniform scale
        </label>
        <span className="muted small">
          {cols}×{rows} · {sc.scene.enabled ? "showing" : "not shown"} · drag or arrow-keys to move · ⋯ / right-click for actions
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
              data-wid={w.id}
              tabIndex={0}
              role="button"
              aria-label={`${w.type} widget at ${w.x}, ${w.y}${w.hidden ? " (hidden)" : ""}${
                isSel ? " (selected)" : ""
              }. Arrow keys move, Enter for actions.`}
              className={`scene-box ${isSel ? "sel" : ""} ${w.hidden ? "hidden" : ""} ${
                isWindowed(w) ? "windowed" : ""
              }`}
              style={{
                left: `${(box.x / cols) * 100}%`,
                top: `${(box.y / rows) * 100}%`,
                width: `${(box.w / cols) * 100}%`,
                height: `${(box.h / rows) * 100}%`,
              }}
              onFocus={() => sc.setSelId(w.id)}
              onKeyDown={(e) => onBoxKey(e, w)}
              onPointerDown={(e) => startBody(e, w)}
              onContextMenu={(e) => openMenu(e, w)}
              title={isWindowed(w) ? "drag to pan · edges move · corners crop" : `${w.type} (${w.x},${w.y})`}
            >
              <span className="box-badge" aria-hidden="true"><Icon name={w.type} size={11} /></span>
              {isSel && (
                <button
                  className="box-actions"
                  aria-label="Widget actions"
                  title="Actions"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    openMenuForBox(w, e.currentTarget.closest(".scene-box"));
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
              )}
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
          <div
            ref={menuRef}
            className="scene-context-menu"
            role="menu"
            aria-label={`${menuWidget.type} widget actions`}
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={onMenuKey}
          >
            {menuItems(menuWidget).map((it, i) =>
              it.head ? (
                <div key={i} className="menu-head">{it.head}</div>
              ) : it.sep ? (
                <div key={i} className="menu-sep" />
              ) : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className={`menu-item ${it.danger ? "danger" : ""}`}
                  onClick={() => {
                    it.run();
                    closeMenu();
                  }}
                >
                  {it.label}
                  {it.on ? " ✓" : ""}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
