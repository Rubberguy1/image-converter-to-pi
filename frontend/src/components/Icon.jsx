import React from "react";

// Monochrome, single-weight icon set (inherits currentColor). Replaces the
// emoji/glyph icons so the faceplate stays on-palette and renders consistently
// across platforms. 24×24 grid, 2px stroke — the one house icon style.
const PATHS = {
  // widget types
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  text: <><path d="M5 6V4h14v2" /><path d="M12 4v16" /><path d="M9 20h6" /></>,
  weather: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  value: <path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 16-5-5L5 20" />
    </>
  ),
  music: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.2" /></>,
  nowplaying: <><path d="M9 18V5l10-2v11" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
  // controls
  chevronUp: <path d="m6 15 6-6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: (
    <>
      <path d="M9.9 4.2A9.5 9.5 0 0 1 12 4c6.5 0 10 7 10 7a17 17 0 0 1-3 3.7M6.6 6.6A17 17 0 0 0 2 11s3.5 7 10 7a9.5 9.5 0 0 0 3.5-.7" />
      <path d="m2 2 20 20" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  layers: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></>,
  sliders: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </>
  ),
};

export default function Icon({ name, size = 16, className = "" }) {
  const p = PATHS[name];
  if (!p) return null;
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {p}
    </svg>
  );
}
