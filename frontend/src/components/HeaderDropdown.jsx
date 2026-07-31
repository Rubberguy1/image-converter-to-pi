import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

// A labelled button that reveals a panel of controls. On desktop it's a popover;
// on mobile it expands inline as an accordion (see the media query in styles.css)
// so every option sits in the page flow instead of a floating window.
export default function HeaderDropdown({ label, title, badge, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`hdropdown ${open ? "open" : ""}`} ref={ref}>
      <button
        className={`hbtn ${open ? "open" : ""} ${badge ? "active" : ""}`}
        title={title}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="hbtn-label">{label}</span>
        {badge && <span className="hdot" />}
        <Icon name="chevronDown" size={16} className="hbtn-caret" />
      </button>
      {/* Kept mounted (hidden) so long-running content like the screen mirror
          isn't torn down when the menu closes. */}
      <div className={`hdropdown-menu ${open ? "" : "hidden"}`}>{children}</div>
    </div>
  );
}
