import React, { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Gallery from "./components/Gallery.jsx";
import Editor from "./components/Editor.jsx";
import MusicPanel from "./components/MusicPanel.jsx";
import WledPanel from "./components/WledPanel.jsx";
import ScreenMirror from "./components/ScreenMirror.jsx";
import StatusBar from "./components/StatusBar.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import SceneEditor from "./components/SceneEditor.jsx";
import PowerWidget from "./components/PowerWidget.jsx";
import Resizer, { clamp } from "./components/Resizer.jsx";

// Panel content pixel dimensions for the crop tool. For 90/270 orientation the
// content is rendered with axes swapped (the as-mounted shape).
function contentDims(m) {
  if (!m || !m.width || !m.height) return { cols: 64, rows: 64 };
  const swapped = m.orientation === 90 || m.orientation === 270;
  return swapped
    ? { cols: m.height, rows: m.width }
    : { cols: m.width, rows: m.height };
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showScene, setShowScene] = useState(false);
  const [leftWidth, setLeftWidth] = useState(
    () => Number(localStorage.getItem("pp.leftWidth")) || 320
  );
  useEffect(() => {
    localStorage.setItem("pp.leftWidth", leftWidth);
  }, [leftWidth]);

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.status());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const refreshMedia = useCallback(async () => {
    try {
      setItems(await api.listMedia());
    } catch (e) {
      showToast(`Could not load library: ${e.message}`, true);
    }
  }, [showToast]);

  useEffect(() => {
    refreshStatus();
    refreshMedia();
    const t = setInterval(refreshStatus, 4000); // keep status/music fresh
    return () => clearInterval(t);
  }, [refreshStatus, refreshMedia]);

  // Push this device's battery % so a scene "value" widget named "battery" works.
  useEffect(() => {
    if (!navigator.getBattery) return;
    let battery;
    let timer;
    const push = () => {
      if (battery) api.pushSceneValue("battery", Math.round(battery.level * 100)).catch(() => {});
    };
    navigator.getBattery().then((b) => {
      battery = b;
      push();
      b.addEventListener("levelchange", push);
      timer = setInterval(push, 60000);
    });
    return () => {
      if (timer) clearInterval(timer);
      if (battery) battery.removeEventListener("levelchange", push);
    };
  }, []);

  const selected = items.find((i) => i.id === selectedId) || null;

  if (!status) {
    return (
      <div className="app loading">
        <h1>Pixel Pusher</h1>
        <p>{error ? `Cannot reach backend: ${error}` : "Connecting…"}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>
          Pixel<span>Pusher</span>
        </h1>
        <StatusBar status={status} onChanged={refreshStatus} onToast={showToast} />
        <PowerWidget power={status.power} />
        <button className="gear" title="Scene editor" onClick={() => setShowScene(true)}>
          🎛
        </button>
        <button
          className="gear"
          title="Settings"
          onClick={() => setShowSettings(true)}
        >
          ⚙
        </button>
      </header>

      <main>
        <aside className="sidebar" style={{ width: leftWidth }}>
          <Gallery
            items={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChanged={refreshMedia}
            onToast={showToast}
          />
          <MusicPanel
            music={status.music}
            onChanged={refreshStatus}
            onToast={showToast}
          />
          {status.wled && (
            <WledPanel
              wled={status.wled}
              onOpenSettings={() => setShowSettings(true)}
              onChanged={refreshStatus}
              onToast={showToast}
            />
          )}
          <ScreenMirror
            cols={contentDims(status.matrix).cols}
            rows={contentDims(status.matrix).rows}
            onChanged={refreshStatus}
            onToast={showToast}
          />
        </aside>

        <Resizer onDrag={(x) => setLeftWidth(clamp(x, 220, 520))} />

        <section className="workspace">
          {selected ? (
            <Editor
              key={selected.id}
              item={selected}
              pwmBits={status.matrix.pwm_bits}
              panelAspect={contentDims(status.matrix).cols / contentDims(status.matrix).rows}
              gridCols={contentDims(status.matrix).cols}
              gridRows={contentDims(status.matrix).rows}
              onPushed={refreshStatus}
              onToast={showToast}
            />
          ) : (
            <div className="placeholder-pane">
              <p>Select or upload an image / GIF to crop and push to the panel.</p>
            </div>
          )}
        </section>
      </main>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={refreshStatus}
          onToast={showToast}
        />
      )}

      {showScene && (
        <SceneEditor
          cols={contentDims(status.matrix).cols}
          rows={contentDims(status.matrix).rows}
          media={items}
          onClose={() => setShowScene(false)}
          onChanged={refreshStatus}
          onToast={showToast}
        />
      )}

      {toast && (
        <div className={`toast ${toast.isError ? "error" : ""}`}>{toast.msg}</div>
      )}
    </div>
  );
}
