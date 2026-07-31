import React from "react";

// One slider look for the whole app: an amber filled rail with a hollow ring
// knob (see styles.css `.range`). The fill left of the knob is painted with a
// CSS gradient driven by `--_fill`; we compute that percent here because WebKit
// has no native "progress" pseudo-element the way Firefox does.
export default function RangeInput({ className = "", min = 0, max = 100, value, ...rest }) {
  const lo = Number(min);
  const hi = Number(max);
  const v = Number(value);
  const pct = hi > lo ? ((v - lo) / (hi - lo)) * 100 : 0;
  return (
    <input
      type="range"
      className={`range ${className}`.trim()}
      min={min}
      max={max}
      value={value}
      style={{ "--_fill": `${Math.max(0, Math.min(100, pct))}%` }}
      {...rest}
    />
  );
}
