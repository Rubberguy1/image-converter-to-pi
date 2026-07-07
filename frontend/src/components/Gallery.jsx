import React, { useRef, useState } from "react";
import { api } from "../api.js";

export default function Gallery({ items, onAddImage, onChanged, onToast }) {
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        await api.upload(file);
      }
      onToast(`Uploaded ${files.length} file(s)`);
      onChanged();
    } catch (e) {
      onToast(`Upload failed: ${e.message}`, true);
    } finally {
      setUploading(false);
    }
  }

  async function remove(e, id) {
    e.stopPropagation();
    if (!confirm("Delete this media?")) return;
    try {
      await api.deleteMedia(id);
      onToast("Deleted");
      onChanged();
    } catch (err) {
      onToast(`Error: ${err.message}`, true);
    }
  }

  return (
    <div className="gallery">
      <div
        className={`dropzone ${dragOver ? "over" : ""}`}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {uploading ? "Uploading…" : "Drop images / GIFs here, or click to browse"}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="thumbs">
        {items.length === 0 && <p className="empty">No media yet.</p>}
        {items.map((it) => (
          <div
            key={it.id}
            className="thumb"
            onClick={() => onAddImage(it)}
            title={`Add ${it.name} to the scene`}
          >
            <img src={api.thumbUrl(it.id)} alt={it.name} />
            {it.animated && <span className="thumb-badge">GIF</span>}
            <button className="thumb-del" onClick={(e) => remove(e, it.id)}>
              ×
            </button>
            <span className="thumb-name">{it.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
