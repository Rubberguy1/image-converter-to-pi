import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

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
  return base;
}

// Shared scene state so the canvas (center) and controls (left pane) stay in sync.
export function useScene(onToast, onChanged) {
  const [scene, setScene] = useState(DEFAULT_SCENE);
  const [selId, setSelId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    api.getScene().then((r) => r.scene && setScene(r.scene)).catch(() => {});
  }, []);

  // Debounced server-rendered preview of the (unsaved) scene.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const url = await api.scenePreviewUrl(scene);
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [scene]);

  return {
    scene,
    selId,
    setSelId,
    previewUrl,
    setBackground: (patch) =>
      setScene((s) => ({ ...s, background: { ...s.background, ...patch } })),
    addWidget: (type, cols, rows) => {
      const w = newWidget(type, cols, rows);
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
