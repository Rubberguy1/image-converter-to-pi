import React from "react";
import { api } from "../api.js";
import Icon from "./Icon.jsx";

// The scene editor's sprite picker: saved sprites from the Sprite Studio.
// Click one to place it in the scene; editing happens in the Studio.
export default function SpritesPanel({ sprites, onAddSprite, onOpenStudio }) {
  return (
    <div className="gallery sprites-panel">
      <p className="field-hint">
        Sprites are made in the <button className="linklike" onClick={() => onOpenStudio(null)}>Sprite Studio</button>.
        Click one to place it in the scene.
      </p>
      <div className="thumbs">
        {(!sprites || sprites.length === 0) && (
          <p className="empty">
            No sprites yet.{" "}
            <button className="linklike" onClick={() => onOpenStudio(null)}>Open the Studio</button> to upload a sheet.
          </p>
        )}
        {(sprites || []).map((sp) => (
          <div
            key={sp.id}
            className="thumb sprite-thumb"
            onClick={() => onAddSprite(sp)}
            title={`Add ${sp.name} to the scene`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && onAddSprite(sp)}
          >
            <img src={api.spriteThumbUrl(sp.id, sp.version)} alt={sp.name} />
            <span className="thumb-badge">
              {sp.frame_count}f · {Object.keys(sp.clips || {}).length} anim{Object.keys(sp.clips || {}).length === 1 ? "" : "s"}
            </span>
            <button
              className="thumb-edit"
              title="Edit in Sprite Studio"
              aria-label={`Edit ${sp.name} in Sprite Studio`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenStudio(sp.id);
              }}
            >
              <Icon name="edit" size={12} />
            </button>
            <span className="thumb-name">{sp.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
