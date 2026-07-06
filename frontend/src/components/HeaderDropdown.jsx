import React, { useEffect, useRef, useState } from "react";

// A header button that reveals a panel of controls in a popover when clicked.
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
    <div className="hdropdown" ref={ref}>
      <button
        className={`hbtn ${open ? "open" : ""} ${badge ? "active" : ""}`}
        title={title}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {badge && <span className="hdot" />}
      </button>
      {/* Kept mounted (hidden) so long-running content like the screen mirror
          isn't torn down when the menu closes. */}
      <div className={`hdropdown-menu ${open ? "" : "hidden"}`}>{children}</div>
    </div>
  );
}
