import React, { useState } from "react";

const ROTS = [0, 90, 180, 270];

// Windows-"Rearrange your displays"-style panel configurator. Each cell of the
// logical wall shows a draggable tile with the physical panel number mounted
// there; drag tiles to swap positions, and use the corner arrows to rotate.
// The data model is unchanged: panel map = [{physical, rot}] per logical cell.
export default function PanelLayout({ cols, rows, map, onChange, identifying, onIdentify }) {
  const n = Math.max(1, cols * rows);
  const [dragFrom, setDragFrom] = useState(null);
  const [over, setOver] = useState(null);

  const cur = Array.from({ length: n }, (_, i) => {
    const e = (map && map[i]) || {};
    let physical = Number.isInteger(e.physical) ? e.physical : i;
    if (physical < 0 || physical >= n) physical = i;
    const rot = ROTS.includes(e.rot) ? e.rot : 0;
    return { physical, rot };
  });

  const rotate = (i, dir) =>
    onChange(cur.map((c, idx) => (idx === i ? { ...c, rot: (((c.rot + dir * 90) % 360) + 360) % 360 } : c)));

  const swap = (a, b) => {
    if (a === b) return;
    const next = cur.slice();
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
  };

  const reset = () => onChange(Array.from({ length: n }, (_, i) => ({ physical: i, rot: 0 })));

  return (
    <div className="settings-section">
      <h3>Panel layout &amp; rotation</h3>
      <p className="settings-hint">
        Click <b>Identify</b> to number each physical panel. Then <b>drag</b> the tiles so they match how the
        panels are mounted on your wall, and use a tile&apos;s <b>corner arrows</b> to rotate it until its blue
        bar points up. Applies live — no restart.
      </p>

      <div className="panel-layout-actions">
        <button className={`identify-btn ${identifying ? "on" : ""}`} onClick={() => onIdentify(!identifying)}>
          {identifying ? "◼ Stop identify" : "🔢 Identify panels"}
        </button>
        <button onClick={reset}>Reset to default order</button>
      </div>

      <div className="mon-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {cur.map((c, i) => {
          const r = Math.floor(i / cols) + 1;
          const col = (i % cols) + 1;
          return (
            <div
              key={i}
              className={`mon-tile ${over === i ? "over" : ""} ${dragFrom === i ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (over !== i) setOver(i);
              }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom != null) swap(dragFrom, i);
                setDragFrom(null);
                setOver(null);
              }}
            >
              <div
                className="mon-face"
                draggable
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setOver(null);
                }}
                style={{ transform: `rotate(${c.rot}deg)` }}
                title="Drag to rearrange"
              >
                <span className="mon-bar" />
                <span className="mon-num">{c.physical}</span>
              </div>

              <span className="mon-rot tl" title="Rotate left"
                draggable={false}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => rotate(i, -1)}>↺</span>
              <span className="mon-rot tr" title="Rotate right"
                draggable={false}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => rotate(i, 1)}>↻</span>
              <span className="mon-rot bl" title="Rotate left"
                draggable={false}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => rotate(i, -1)}>↺</span>
              <span className="mon-rot br" title="Rotate right"
                draggable={false}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => rotate(i, 1)}>↻</span>

              <span className="mon-pos">r{r}·c{col}{c.rot ? ` · ${c.rot}°` : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
