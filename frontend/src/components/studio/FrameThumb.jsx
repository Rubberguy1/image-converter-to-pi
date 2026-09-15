import React, { useEffect, useRef } from "react";

// A small pixel-perfect thumbnail of one sheet frame.
export default function FrameThumb({ src, frame, size = 40, className = "", title }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !src || !frame) return;
    // Integer upscale for small frames; shrink (fractionally) big ones so a
    // frame larger than the thumbnail never renders at full size.
    const k = Math.min(size / frame.w, size / frame.h);
    const scale = k >= 1 ? Math.floor(k) : k;
    cv.width = Math.max(1, Math.round(frame.w * scale));
    cv.height = Math.max(1, Math.round(frame.h * scale));
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(src, frame.x, frame.y, frame.w, frame.h, 0, 0, cv.width, cv.height);
  }, [src, frame?.x, frame?.y, frame?.w, frame?.h, size]);
  return <canvas ref={ref} className={`frame-thumb ${className}`} title={title} aria-hidden="true" />;
}
