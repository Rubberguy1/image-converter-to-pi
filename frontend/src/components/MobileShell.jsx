import React, { useState } from "react";
import Icon from "./Icon.jsx";
import Gallery from "./Gallery.jsx";
import SceneCanvas from "./SceneCanvas.jsx";
import SceneControls from "./SceneControls.jsx";
import SceneSidebar from "./SceneSidebar.jsx";
import SettingsModal from "./SettingsModal.jsx";
import MobileHome from "./MobileHome.jsx";
import MobileScenes from "./MobileScenes.jsx";

const TABS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "editor", label: "Editor", icon: "edit" },
  { id: "scenes", label: "Scenes", icon: "grid" },
  { id: "settings", label: "Settings", icon: "gear" },
];

// The mobile app: a fixed bottom tab bar over one full-screen view at a time.
export default function MobileShell({
  sc, status, dims, items, music, fonts, showToast, refreshStatus, refreshMedia,
}) {
  const [tab, setTab] = useState("home");

  return (
    <div className="mshell">
      <div className="mview" key={tab}>
        {tab === "home" && (
          <MobileHome
            sc={sc}
            status={status}
            dims={dims}
            onToast={showToast}
            onChanged={refreshStatus}
            goEditor={() => setTab("editor")}
            goScenes={() => setTab("scenes")}
          />
        )}

        {tab === "editor" && (
          <div className="meditor">
            <SceneCanvas sc={sc} cols={dims.cols} rows={dims.rows} music={music} media={items} />
            <SceneControls sc={sc} cols={dims.cols} rows={dims.rows} media={items} music={music} fonts={fonts} />
            <SceneSidebar sc={sc} cols={dims.cols} rows={dims.rows} media={items} />
            <Gallery
              items={items}
              onAddImage={(item) => {
                sc.addImage(item, dims.cols, dims.rows);
                showToast(`Added "${item.name}" to the scene`);
              }}
              onChanged={refreshMedia}
              onToast={showToast}
            />
          </div>
        )}

        {tab === "scenes" && (
          <MobileScenes sc={sc} onToast={showToast} goEditor={() => setTab("editor")} />
        )}

        {tab === "settings" && (
          <SettingsModal asPage onSaved={refreshStatus} onToast={showToast} />
        )}
      </div>

      <nav className="mnav" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`mnav-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
          >
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
