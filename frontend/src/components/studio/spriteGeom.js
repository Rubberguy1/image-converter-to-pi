// Geometry + sheet helpers shared by the Sprite Studio (mirrors
// backend/app/sprites/model.py so previews match the panel exactly).

export const newId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `r${Date.now()}`)
    .replace(/-/g, "")
    .slice(0, 8);

export const PRESET_CLIPS = ["idle", "talk", "dance", "wave", "sleep", "happy", "sad"];
export const TRIGGER_EVENTS = ["say", "notification", "track", "music", "value", "time"];
export const ANCHORS = [
  "top-left", "top-center", "top-right", "center", "bottom-left", "bottom-center", "bottom-right",
];
export const EVENT_LABELS = {
  say: "Told to say something",
  notification: "Notification showing",
  track: "New track starts",
  music: "Music playing",
  value: "Value threshold",
  time: "Time of day",
};

export const cleanClipName = (s) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);

export const EVENT_RANK = { say: 0, notification: 1, track: 2, music: 3, value: 4, time: 5 };

// The frames a region yields: [{x, y, w, h}], numbered by rows (left→right,
// top→bottom) or by columns (top→bottom, left→right).
export function regionCells(r) {
  const out = [];
  const cols = Math.max(1, r.cols | 0);
  const rows = Math.max(1, r.rows | 0);
  const cell = (col, row) => ({
    x: r.x + col * (r.w + (r.gap_x | 0)),
    y: r.y + row * (r.h + (r.gap_y | 0)),
    w: r.w,
    h: r.h,
  });
  if (r.order === "cols") {
    for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) out.push(cell(col, row));
  } else {
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) out.push(cell(col, row));
  }
  return out;
}

// How many whole cells of w (+gap) fit from x to the sheet edge.
export function fitCount(start, cell, gap, total) {
  return Math.max(1, Math.floor((total - start + gap) / Math.max(1, cell + gap)));
}

// Outer bounds of a repeated region on the sheet.
export function regionBounds(r) {
  const cols = Math.max(1, r.cols | 0);
  const rows = Math.max(1, r.rows | 0);
  return {
    x: r.x,
    y: r.y,
    w: cols * r.w + (cols - 1) * (r.gap_x | 0),
    h: rows * r.h + (rows - 1) * (r.gap_y | 0),
  };
}

// All frames across every region (and sheet), numbered in order:
// [{x, y, w, h, sheet, region, index}].
export function framesOf(regions) {
  const out = [];
  for (const r of regions || []) {
    for (const c of regionCells(r)) out.push({ ...c, sheet: r.sheet || "", region: r.id, index: out.length });
  }
  return out;
}

// The widget box at scale 1 = the largest frame.
export function boxOf(frames, fallback = { w: 16, h: 16 }) {
  if (!frames || !frames.length) return fallback;
  return {
    w: Math.max(...frames.map((f) => f.w)),
    h: Math.max(...frames.map((f) => f.h)),
  };
}

export function anchorOffset(anchor, bw, bh, fw, fh) {
  const a = anchor || "bottom-center";
  const ox = a.endsWith("left") ? 0 : a.endsWith("right") ? bw - fw : Math.floor((bw - fw) / 2);
  const oy = a.startsWith("top") ? 0 : a.startsWith("bottom") ? bh - fh : Math.floor((bh - fh) / 2);
  return { ox, oy };
}

// Apply the sprite's transparency rule client-side so previews match the
// panel: "auto" keys the top-left pixel when the sheet has no alpha; a hex
// colour keys that colour; "none" leaves it alone.
export function keyedCanvas(img, transparent) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  if (transparent === "none") return c;
  let id;
  try {
    id = ctx.getImageData(0, 0, c.width, c.height);
  } catch {
    return c; // cross-origin without CORS → can't read pixels; show raw
  }
  const px = id.data;
  let key;
  if (transparent === "auto") {
    for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return c; // has alpha already
    key = [px[0], px[1], px[2]];
  } else {
    const h = String(transparent).replace("#", "");
    key = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    if (key.some(Number.isNaN)) return c;
  }
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] === key[0] && px[i + 1] === key[1] && px[i + 2] === key[2]) px[i + 3] = 0;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

// Build the studio's editable draft from a sprite as the API returns it.
export function draftFrom(sp) {
  return {
    name: sp.name,
    transparent: sp.transparent || "auto",
    anchor: sp.anchor || "bottom-center",
    idle_clip: sp.idle_clip || "idle",
    sheets: (sp.sheets || []).map((s) => ({ id: s.id, name: s.name, w: s.w, h: s.h })),
    regions: (sp.regions || []).map((r) => ({ ...r, sheet: r.sheet || (sp.sheets && sp.sheets[0] ? sp.sheets[0].id : "") })),
    clips: Object.entries(sp.clips || {}).map(([name, c]) => ({
      name,
      frames: [...(c.frames || [])],
      fps: c.fps ?? 6,
      loop: c.loop !== false,
    })),
    triggers: (sp.triggers || []).map((t) => ({ ...t, params: { ...(t.params || {}) } })),
  };
}

// The PUT body for the draft.
export function patchFrom(draft) {
  const clips = {};
  for (const c of draft.clips) {
    const name = cleanClipName(c.name);
    if (!name) continue;
    clips[name] = { frames: c.frames, fps: Number(c.fps) || 6, loop: c.loop !== false };
  }
  return {
    name: draft.name,
    transparent: draft.transparent,
    anchor: draft.anchor,
    idle_clip: draft.idle_clip,
    sheets: (draft.sheets || []).map((s) => ({ id: s.id, name: s.name || "" })),
    regions: draft.regions.map((r) => ({
      id: r.id,
      sheet: r.sheet || "",
      name: r.name || "",
      x: r.x | 0,
      y: r.y | 0,
      w: Math.max(1, r.w | 0),
      h: Math.max(1, r.h | 0),
      cols: Math.max(1, r.cols | 0),
      rows: Math.max(1, r.rows | 0),
      gap_x: Math.max(0, r.gap_x | 0),
      gap_y: Math.max(0, r.gap_y | 0),
      order: r.order === "cols" ? "cols" : "rows",
    })),
    clips,
    // Stored in priority order: by event kind, then by animation order.
    triggers: [...draft.triggers]
      .sort((a, b) => (EVENT_RANK[a.event] ?? 9) - (EVENT_RANK[b.event] ?? 9))
      .map((t) => ({ id: t.id, event: t.event, clip: t.clip || "", params: t.params || {} })),
  };
}
