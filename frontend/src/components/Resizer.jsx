import React from "react";

// A thin draggable divider. Calls onDrag(clientX) while dragging; the parent
// derives the new panel width from the cursor position (robust, no drift).
export default function Resizer({ onDrag }) {
  function onPointerDown(e) {
    e.preventDefault();
    const move = (ev) => onDrag(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.classList.add("resizing");
  }
  return (
    <div className="resizer" onPointerDown={onPointerDown} title="Drag to resize" />
  );
}

// clamp helper shared by callers
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
