import React, { useEffect, useState } from "react";

// A number field you can clear while typing. Valid values propagate live (so
// previews follow); an empty box, a stray "0" below the minimum, or junk is
// only corrected when you leave the field (or press Enter), snapping to `min`.
export default function NumInput({ value, onChange, min = 0, max, step, ...rest }) {
  const [text, setText] = useState(String(value ?? ""));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value ?? ""));
  }, [value, editing]);

  const clampNum = (n) => {
    if (min !== undefined && min !== null) n = Math.max(min, n);
    if (max !== undefined && max !== null) n = Math.min(max, n);
    return n;
  };
  const commit = () => {
    let n = Number(text);
    if (text.trim() === "" || Number.isNaN(n)) n = min ?? 0;
    n = clampNum(n);
    onChange(n);
    setText(String(n));
    setEditing(false);
  };

  return (
    <input
      type="number"
      value={text}
      min={min}
      max={max}
      step={step}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = Number(t);
        // Push through only values that are already in range; leave "" / "0"
        // alone so the user can keep typing.
        if (t.trim() !== "" && !Number.isNaN(n) && n === clampNum(n)) onChange(n);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          e.currentTarget.blur();
        }
      }}
      {...rest}
    />
  );
}
