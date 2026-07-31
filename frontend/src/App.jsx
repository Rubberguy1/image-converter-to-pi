import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Gallery from "./components/Gallery.jsx";
import MusicPanel from "./components/MusicPanel.jsx";
import WledPanel from "./components/WledPanel.jsx";
import ScreenMirror from "./components/ScreenMirror.jsx";
import StatusBar from "./components/StatusBar.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import SceneCanvas from "./components/SceneCanvas.jsx";
import SceneControls from "./components/SceneControls.jsx";
import SceneSidebar from "./components/SceneSidebar.jsx";
import HeaderDropdown from "./components/HeaderDropdown.jsx";
import PowerWidget from "./components/PowerWidget.jsx";
import PerfBadge from "./components/PerfBadge.jsx";
import ConnectScreen from "./components/ConnectScreen.jsx";
import Resizer, { clamp } from "./components/Resizer.jsx";
import MobileShell from "./components/MobileShell.jsx";
import { useScene } from "./hooks/useScene.js";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { backendBase, setBackendBase, isRemoteBackend, rememberDevice } from "./backend.js";

// Panel content pixel dimensions. For 90/270 orientation the content is rendered
// with axes swapped (the as-mounted shape).
function contentDims(m) {
  if (!m || !m.width || !m.height) return { cols: 64, rows: 64 };
  const swapped = m.orientation === 90 || m.orientation === 270;
  return swapped ? { cols: m.height, rows: m.width } : { cols: m.width, rows: m.height };
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [fonts, setFonts] = useState([{ name: "5x7", height: 7 }]);
  const [leftWidth, setLeftWidth] = useState(
    () => Number(localStorage.getItem("pp.leftWidth")) || 340
  );
  useEffect(() => {
    localStorage.setItem("pp.leftWidth", leftWidth);
  }, [leftWidth]);

  const toastTimer = useRef(null);
  const showToast = useCallback((msg, isError = false, action = null) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, isError, action });
    // Give an actionable toast (e.g. Undo) longer to be clicked.
    toastTimer.current = setTimeout(() => setToast(null), action ? 6000 : 3000);
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

  const sc = useScene(showToast, refreshStatus, items);
  const isMobile = useIsMobile();

  // Undo / redo for scene edits (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))
        return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        e.shiftKey ? sc.redo() : sc.undo();
      } else if (k === "y") {
        e.preventDefault();
        sc.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sc.undo, sc.redo]);

  // Remember a remote Pi in this browser once we've successfully reached it.
  const remembered = useRef("");
  useEffect(() => {
    const base = backendBase();
    if (status && isRemoteBackend() && remembered.current !== base) {
      remembered.current = base;
      rememberDevice(base, status.name);
    }
  }, [status]);

  // Switch the (single) music source that feeds album-art music widgets.
  const setMusicProvider = useCallback(
    async (provider) => {
      try {
        await api.configureMusic(provider, provider !== "none");
        await refreshStatus();
        showToast(provider === "none" ? "Music source off" : `Music source: ${provider}`);
      } catch (e) {
        showToast(`Error: ${e.message}`, true);
      }
    },
    [refreshStatus, showToast]
  );

  useEffect(() => {
    refreshStatus();
    refreshMedia();
    api.listFonts().then((r) => r.fonts?.length && setFonts(r.fonts)).catch(() => {});
    const t = setInterval(refreshStatus, 4000);
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

  if (!status) {
    return (
      <ConnectScreen
        error={error}
        onConnect={() => {
          setError(null);
          refreshStatus();
          refreshMedia();
        }}
      />
    );
  }

  const dims = contentDims(status.matrix);
  const mirrorActive = status.now_showing.source === "live";
  const music = {
    provider: status.music.provider,
    enabled: status.music.enabled,
    playing: status.music.playing,
    artist: status.music.artist,
    title: status.music.title,
    setProvider: setMusicProvider,
  };

  const toastEl = toast && (
    <div className={`toast ${toast.isError ? "error" : ""}`}>
      <span>{toast.msg}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action.onClick();
            setToast(null);
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className="app mobile">
        <MobileShell
          sc={sc}
          status={status}
          dims={dims}
          items={items}
          music={music}
          fonts={fonts}
          showToast={showToast}
          refreshStatus={refreshStatus}
          refreshMedia={refreshMedia}
        />
        {toastEl}
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
        <PerfBadge />
        {isRemoteBackend() && (
          <button
            className="server-chip"
            title={`Backend: ${backendBase()} — click to change`}
            onClick={() => {
              const v = prompt("Backend server URL", backendBase());
              if (v !== null) {
                setBackendBase(v);
                location.reload();
              }
            }}
          >
            🖧 {(() => { try { return new URL(backendBase()).host; } catch { return "remote"; } })()}
          </button>
        )}

        <HeaderDropdown label="🎵 Music" title="Music sync" badge={status.music.enabled}>
          <MusicPanel music={status.music} onChanged={refreshStatus} onToast={showToast} />
        </HeaderDropdown>
        {status.wled && (
          <HeaderDropdown label="💡 WLED" title="WLED sync" badge={status.wled.enabled}>
            <WledPanel
              wled={status.wled}
              onOpenSettings={() => setShowSettings(true)}
              onChanged={refreshStatus}
              onToast={showToast}
            />
          </HeaderDropdown>
        )}
        <HeaderDropdown label="🖥️ Mirror" title="Screen mirror" badge={mirrorActive}>
          <ScreenMirror cols={dims.cols} rows={dims.rows} onChanged={refreshStatus} onToast={showToast} />
        </HeaderDropdown>

        <button className="gear" title="Settings" onClick={() => setShowSettings(true)}>
          ⚙
        </button>
      </header>

      <main>
        <aside className="sidebar" style={{ width: leftWidth }}>
          <Gallery
            items={items}
            onAddImage={(item) => {
              sc.addImage(item, dims.cols, dims.rows);
              showToast(`Added "${item.name}" to the scene`);
            }}
            onChanged={refreshMedia}
            onToast={showToast}
          />
          <SceneControls sc={sc} cols={dims.cols} rows={dims.rows} media={items} music={music} fonts={fonts} />
        </aside>

        <Resizer onDrag={(x) => setLeftWidth(clamp(x, 240, 560))} />

        <section className="workspace">
          <SceneCanvas sc={sc} cols={dims.cols} rows={dims.rows} music={music} media={items} />
        </section>

        <SceneSidebar sc={sc} cols={dims.cols} rows={dims.rows} media={items} />
      </main>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={refreshStatus}
          onToast={showToast}
        />
      )}

      {toastEl}
    </div>
  );
}
