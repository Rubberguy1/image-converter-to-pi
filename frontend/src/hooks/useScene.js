import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";

// Widgets whose content changes over time (independently of edits), so the
// preview must re-render on a timer, not just when the scene object changes.
const LIVE_TYPES = new Set(["music", "nowplaying", "clock", "weather", "value"]);
// Text widgets that carry an explicit text box (w×h) the text wraps/clips within.
const TEXT_TYPES = new Set(["clock", "text", "weather", "value", "nowplaying"]);

// Give text widgets a sensible box if they don't have one yet (older scenes).
function withBoxes(scene) {
  return {
    ...scene,
    widgets: (scene.widgets || []).map((w) => {
      if (!TEXT_TYPES.has(w.type) || (w.config && w.config.w)) return w;
      const size = w.size || 8;
      const h = w.type === "nowplaying" ? size * 2 + 6 : size + 4;
      return { ...w, config: { ...(w.config || {}), w: 60, h } };
    }),
  };
}

const DEFAULT_SCENE = {
  enabled: false,
  background: { type: "none", color: "#000000", media_id: null, fit: "cover" },
  widgets: [],
};

export function newWidget(type, cols, rows) {
  const id =
    (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
    `w${Math.round(performance.now())}`;
  const base = {
    id,
    type,
    x: 2,
    y: 2,
    color: "#FFFFFF",
    size: Math.max(6, Math.round((rows || 64) / 8)),
    align: "left",
    config: {},
  };
  if (type === "clock") base.config = { format: "%H:%M" };
  if (type === "text") base.config = { text: "TEXT" };
  if (type === "value") base.config = { name: "battery", label: "", suffix: "%" };
  if (type === "image") base.config = { media_id: null, w: cols || 64, h: rows || 64, fit: "cover" };
  if (type === "music") {
    const s = Math.max(8, Math.round(Math.min(cols || 64, rows || 64) / 2));
    base.config = { w: s, h: s, fit: "cover", disc: false };
  }
  if (type === "nowplaying") base.config = { show_artist: true };
  if (TEXT_TYPES.has(type)) {
    const bw = Math.max(24, Math.round((cols || 64) * 0.5));
    const bh = type === "nowplaying" ? base.size * 2 + 6 : base.size + 4;
    base.config = { ...base.config, w: bw, h: bh };
  }
  return base;
}

// Shared scene state so the canvas (center) and controls (left pane) stay in sync.
export function useScene(onToast, onChanged) {
  const [scene, setScene] = useState(DEFAULT_SCENE);
  const [selId, setSelId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saved, setSaved] = useState([]);
  const timer = useRef(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const refreshSaved = () =>
    api.listScenes().then((r) => setSaved(r.scenes || [])).catch(() => {});

  useEffect(() => {
    api.getScene().then((r) => r.scene && setScene(withBoxes(r.scene))).catch(() => {});
    refreshSaved();
  }, []);

  const fetchPreview = useCallback(async () => {
    try {
      const url = await api.scenePreviewUrl(sceneRef.current);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    } catch {
      /* ignore */
    }
  }, []);

  // Debounced server-rendered preview whenever the scene is edited.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fetchPreview, 250);
    return () => clearTimeout(timer.current);
  }, [scene, fetchPreview]);

  // Live widgets (album art, clock, weather, pushed values) change on their own,
  // so keep re-rendering the preview on a timer while any are present.
  const hasLive = scene.widgets.some((w) => LIVE_TYPES.has(w.type));
  useEffect(() => {
    if (!hasLive) return undefined;
    const id = setInterval(fetchPreview, 1000);
    return () => clearInterval(id);
  }, [hasLive, fetchPreview]);

  return {
    scene,
    selId,
    setSelId,
    previewUrl,
    saved,
    saveAs: async (name) => {
      try {
        await api.saveScene(scene); // persist current as active first
        await api.saveNamedScene(name);
        await refreshSaved();
        onToast(`Saved scene "${name}"`);
      } catch (e) {
        onToast(`Error: ${e.message}`, true);
      }
    },
    loadNamed: async (name) => {
      try {
        const r = await api.loadNamedScene(name);
        setScene(withBoxes(r.scene));
        setSelId(null);
        onToast(`Loaded "${name}"`);
        onChanged && onChanged();
      } catch (e) {
        onToast(`Error: ${e.message}`, true);
      }
    },
    deleteNamed: async (name) => {
      try {
        await api.deleteNamedScene(name);
        await refreshSaved();
        onToast(`Deleted "${name}"`);
      } catch (e) {
        onToast(`Error: ${e.message}`, true);
      }
    },
    setBackground: (patch) =>
      setScene((s) => ({ ...s, background: { ...s.background, ...patch } })),
    addWidget: (type, cols, rows) => {
      const w = newWidget(type, cols, rows);
      setScene((s) => ({ ...s, widgets: [...s.widgets, w] }));
      setSelId(w.id);
    },
    // Place a library image into the scene as an image widget, scaled to fit
    // fully within the panel while preserving its aspect ratio (so a tall image
    // on a square panel isn't cropped), then centered.
    addImage: (item, cols, rows) => {
      const iw = item.width || cols;
      const ih = item.height || rows;
      const scale = Math.min(cols / iw, rows / ih);
      const tw = Math.max(1, Math.min(cols, Math.round(iw * scale)));
      const th = Math.max(1, Math.min(rows, Math.round(ih * scale)));
      const w = newWidget("image", cols, rows);
      w.config = { media_id: item.id, w: tw, h: th, fit: "cover" };
      w.x = Math.round((cols - tw) / 2);
      w.y = Math.round((rows - th) / 2);
      setScene((s) => ({ ...s, widgets: [...s.widgets, w] }));
      setSelId(w.id);
    },
    updateWidget: (id, patch) =>
      setScene((s) => ({
        ...s,
        widgets: s.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      })),
    updateConfig: (id, patch) =>
      setScene((s) => ({
        ...s,
        widgets: s.widgets.map((w) =>
          w.id === id ? { ...w, config: { ...w.config, ...patch } } : w
        ),
      })),
    // Draw order = array order (index 0 = bottom). Reordering changes layering.
    moveWidget: (id, dir) =>
      setScene((s) => {
        const arr = [...s.widgets];
        const i = arr.findIndex((w) => w.id === id);
        if (i < 0) return s;
        const [item] = arr.splice(i, 1);
        const j =
          dir === "front"
            ? arr.length
            : dir === "back"
            ? 0
            : dir === "forward"
            ? Math.min(arr.length, i + 1)
            : Math.max(0, i - 1);
        arr.splice(j, 0, item);
        return { ...s, widgets: arr };
      }),
    toggleHidden: (id) =>
      setScene((s) => ({
        ...s,
        widgets: s.widgets.map((w) => (w.id === id ? { ...w, hidden: !w.hidden } : w)),
      })),
    removeWidget: (id) => {
      setScene((s) => ({ ...s, widgets: s.widgets.filter((w) => w.id !== id) }));
      setSelId((p) => (p === id ? null : p));
    },
    save: async (weather) => {
      try {
        await api.saveScene(scene);
        if (weather) await api.updateSettings(weather);
        onToast("Scene saved");
        onChanged && onChanged();
      } catch (e) {
        onToast(`Error: ${e.message}`, true);
      }
    },
    toggle: async () => {
      const enabled = !scene.enabled;
      setScene((s) => ({ ...s, enabled }));
      try {
        await api.saveScene({ ...scene, enabled });
        onToast(enabled ? "Scene showing on panel" : "Scene off");
        onChanged && onChanged();
      } catch (e) {
        onToast(`Error: ${e.message}`, true);
      }
    },
  };
}
