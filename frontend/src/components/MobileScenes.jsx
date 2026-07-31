import React, { useState } from "react";
import Icon from "./Icon.jsx";
import { api } from "../api.js";

// The Scenes tab: save the current composition as a named preset, and load or
// delete your saved scenes.
export default function MobileScenes({ sc, onToast, goEditor }) {
  const [name, setName] = useState("");

  const saveAs = () => {
    const n = name.trim();
    if (!n) {
      onToast("Name the scene first", true);
      return;
    }
    sc.saveAs(n);
    setName("");
  };

  const load = (nm) => {
    if (!sc.dirty || window.confirm(`Load "${nm}" and discard your unsaved changes?`))
      sc.loadNamed(nm);
  };

  return (
    <div className="mscenes">
      <h2>Scenes</h2>

      <div className="card mscene-saveas">
        <label>Save the current scene as a preset</label>
        <div className="row">
          <input
            type="text"
            value={name}
            placeholder="e.g. Clock"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveAs()}
          />
          <button className="primary" onClick={saveAs}>Save</button>
        </div>
        {sc.dirty && (
          <p className="field-hint">You have unsaved edits — saving stores them as this preset.</p>
        )}
      </div>

      <h3 className="sub">Saved presets</h3>
      {sc.saved.length === 0 && (
        <p className="field-hint">
          No saved scenes yet. Compose one in the Editor, then save it here.
        </p>
      )}
      <div className="mscene-grid">
        {sc.saved.map((nm) => (
          <div className="card mscene-tile" key={nm}>
            <button
              className="mscene-thumb"
              onClick={() => load(nm)}
              title={`Load "${nm}"`}
              aria-label={`Load ${nm}`}
            >
              <img
                src={api.sceneThumbUrl(nm)}
                alt={`Preview of ${nm}`}
                loading="lazy"
                onError={(e) => e.currentTarget.classList.add("failed")}
              />
            </button>
            <div className="mscene-foot">
              <span className="mscene-name">{nm}</span>
              <button
                className="mscene-del"
                aria-label={`Delete ${nm}`}
                onClick={() => {
                  if (window.confirm(`Delete "${nm}"? This can't be undone.`)) sc.deleteNamed(nm);
                }}
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
