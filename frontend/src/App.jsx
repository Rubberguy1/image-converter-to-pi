import React, { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Gallery from "./components/Gallery.jsx";
import Editor from "./components/Editor.jsx";
import MusicPanel from "./components/MusicPanel.jsx";
import WledPanel from "./components/WledPanel.jsx";
import StatusBar from "./components/StatusBar.jsx";

export default function App() {
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

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
      </header>

      <main>
        <aside className="sidebar">
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
              onChanged={refreshStatus}
              onToast={showToast}
            />
          )}
        </aside>

        <section className="workspace">
          {selected ? (
            <Editor
              key={selected.id}
              item={selected}
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

      {toast && (
        <div className={`toast ${toast.isError ? "error" : ""}`}>{toast.msg}</div>
      )}
    </div>
  );
}
