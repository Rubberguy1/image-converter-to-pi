import React, { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "./Resizer.jsx";

// A crop locked to the panel's exact pixel size (cols × rows). The crop window
// never resizes — you drag to pan the image under it, so every panel pixel maps
// to exactly one source pixel (true 1:1). Rendered nearest-neighbour + a grid.
export default function PixelCropper({ imageUrl, srcW, srcH, cols, rows, onChange }) {
  const ref = useRef(null);

  // pan = top-left of the cols×rows window, in whole source pixels.
  const clampX = useCallback(
    (v) => clamp(Math.round(v), Math.min(0, srcW - cols), Math.max(0, srcW - cols)),
    [srcW, cols]
  );
  const clampY = useCallback(
    (v) => clamp(Math.round(v), Math.min(0, srcH - rows), Math.max(0, srcH - rows)),
    [srcH, rows]
  );

  const [pan, setPan] = useState(() => ({
    x: clampX((srcW - cols) / 2),
    y: clampY((srcH - rows) / 2),
  }));

  // Re-centre/clamp when the source or panel size changes.
  useEffect(() => {
    setPan((p) => ({ x: clampX(p.x), y: clampY(p.y) }));
  }, [clampX, clampY]);

  // Report the normalised crop whenever the pan changes.
  useEffect(() => {
    onChange({
      x: pan.x / srcW,
      y: pan.y / srcH,
      w: Math.min(1, cols / srcW),
      h: Math.min(1, rows / srcH),
    });
  }, [pan.x, pan.y, srcW, srcH, cols, rows, onChange]);

  function onPointerDown(e) {
    e.preventDefault();
    const rect = ref.current.getBoundingClientRect();
    const sxPerPx = cols / rect.width; // source px per display px
    const syPerPx = rows / rect.height;
    const startMX = e.clientX;
    const startMY = e.clientY;
    const startPan = { ...pan };
    const move = (ev) => {
      // Dragging the image right reveals more of its left side → window moves left.
      const dx = (ev.clientX - startMX) * sxPerPx;
      const dy = (ev.clientY - startMY) * syPerPx;
      setPan({ x: clampX(startPan.x - dx), y: clampY(startPan.y - dy) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("grabbing");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.classList.add("grabbing");
  }

  return (
    <div className="pixel-lock" ref={ref} onPointerDown={onPointerDown}>
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          width: `${(srcW / cols) * 100}%`,
          height: `${(srcH / rows) * 100}%`,
          left: `${(-pan.x / cols) * 100}%`,
          top: `${(-pan.y / rows) * 100}%`,
          imageRendering: "pixelated",
        }}
      />
      <div
        className="pixel-grid"
        style={{ backgroundSize: `calc(100% / ${cols}) calc(100% / ${rows})` }}
      />
    </div>
  );
}
