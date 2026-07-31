import React, { useState } from "react";
import Icon from "./Icon.jsx";

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
      <div className="mscene-list">
        {sc.saved.map((nm) => (
          <div className="card mscene-card" key={nm}>
            <span className="mscene-name">{nm}</span>
            <div className="mscene-actions">
              <button className="primary" onClick={() => load(nm)}>Load</button>
              <button
                className="danger"
                aria-label={`Delete ${nm}`}
                onClick={() => {
                  if (window.confirm(`Delete "${nm}"? This can't be undone.`)) sc.deleteNamed(nm);
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
