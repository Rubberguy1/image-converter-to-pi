import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api.js";
import Icon from "../Icon.jsx";
import SheetCanvas from "./SheetCanvas.jsx";
import AnimationsPanel from "./AnimationsPanel.jsx";
import SliceDialog from "./SliceDialog.jsx";
import FrameThumb from "./FrameThumb.jsx";
import NumInput from "./NumInput.jsx";
import Resizer, { clamp } from "../Resizer.jsx";
import {
  ANCHORS,
  boxOf,
  cleanClipName,
  draftFrom,
  framesOf,
  keyedCanvas,
  patchFrom,
  regionBounds,
} from "./spriteGeom.js";

// The Sprite Studio: a separate section of the app for turning sprite sheets
// into a character. A sprite owns one or more sheets; each sheet is sliced
// into frames (Aseprite-style grid import, or hand-drawn regions); frames are
// numbered across all sheets so an animation can mix them; each animation
// lists the events that play it. Saved sprites are placed in scenes from the
// scene editor's Sprites tab.
export default function SpriteStudio({ sprites, onChanged, initialId, onToast, mobile = false }) {
  const [selId, setSelId] = useState(initialId || (sprites[0] && sprites[0].id) || null);
  const sprite = sprites.find((s) => s.id === selId) || null;
  const [draft, setDraft] = useState(null);
  const [savedDraft, setSavedDraft] = useState(null);
  const [tool, setTool] = useState("regions");
  const [selSheetId, setSelSheetId] = useState(null);
  const [selRegionId, setSelRegionId] = useState(null);
  const [selClip, setSelClip] = useState(null);
  const [imgs, setImgs] = useState({}); // sheet id → HTMLImageElement
  const [srcs, setSrcs] = useState({}); // sheet id → keyed canvas
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slice, setSlice] = useState(null); // null | { initial, sheetId }
  // Resizable side panels (desktop), remembered per browser.
  const [leftW, setLeftW] = useState(() => Number(localStorage.getItem("pp.studio.left")) || 280);
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem("pp.studio.right")) || 400);
  const bodyRef = useRef(null);
  useEffect(() => {
    localStorage.setItem("pp.studio.left", leftW);
  }, [leftW]);
  useEffect(() => {
    localStorage.setItem("pp.studio.right", rightW);
  }, [rightW]);
  const dragLeft = (x) => {
    const rect = bodyRef.current?.getBoundingClientRect();
    if (rect) setLeftW(clamp(Math.round(x - rect.left), 220, Math.max(220, rect.width - rightW - 320)));
  };
  const dragRight = (x) => {
    const rect = bodyRef.current?.getBoundingClientRect();
    if (rect) setRightW(clamp(Math.round(rect.right - x), 300, Math.max(300, rect.width - leftW - 320)));
  };
  const fileInput = useRef(null);
  const sheetInput = useRef(null);
  const openSliceFor = useRef(null); // { spriteId, sheetId } to auto-open the slicer for a fresh sheet
  const dirty = draft && savedDraft && JSON.stringify(draft) !== JSON.stringify(savedDraft);

  useEffect(() => {
    if (initialId) setSelId(initialId);
  }, [initialId]);
  useEffect(() => {
    if (!sprite && sprites.length) setSelId(sprites[0].id);
  }, [sprite, sprites]);

  // (Re)load the draft when the selection or the saved version changes.
  useEffect(() => {
    if (!sprite) {
      setDraft(null);
      setSavedDraft(null);
      return;
    }
    const d = draftFrom(sprite);
    setDraft(d);
    setSavedDraft(JSON.parse(JSON.stringify(d)));
    setSelSheetId((cur) => (cur && d.sheets.some((s) => s.id === cur) ? cur : d.sheets[0]?.id || null));
    setSelRegionId((cur) => (cur && d.regions.some((r) => r.id === cur) ? cur : d.regions[0]?.id || null));
    setSelClip((cur) => (cur && d.clips.some((c) => c.name === cur) ? cur : d.clips[0]?.name || null));
  }, [sprite?.id, sprite?.version]);

  // Load every sheet image, then key each by the sprite's transparency rule.
  useEffect(() => {
    if (!sprite) return undefined;
    let alive = true;
    setImgs({});
    setSrcs({});
    for (const sh of sprite.sheets || []) {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => alive && setImgs((m) => ({ ...m, [sh.id]: im }));
      im.src = api.spriteSheetImageUrl(sprite.id, sh.id, sprite.version);
    }
    return () => {
      alive = false;
    };
  }, [sprite?.id, sprite?.version]);
  useEffect(() => {
    if (!draft) return;
    const next = {};
    for (const [id, im] of Object.entries(imgs)) next[id] = keyedCanvas(im, draft.transparent);
    setSrcs(next);
  }, [imgs, draft?.transparent]);

  // A freshly uploaded sheet goes straight into the slicer once it's loaded.
  useEffect(() => {
    const want = openSliceFor.current;
    if (want && sprite && draft && sprite.id === want.spriteId && srcs[want.sheetId]) {
      openSliceFor.current = null;
      setSelSheetId(want.sheetId);
      const initial = draft.regions.find((r) => r.sheet === want.sheetId) || null;
      setSlice({ initial, sheetId: want.sheetId });
    }
  }, [srcs, sprite, draft]);

  const frames = useMemo(() => framesOf(draft?.regions || []), [draft?.regions]);
  const box = useMemo(() => boxOf(frames, { w: sprite?.sheet_w || 16, h: sprite?.sheet_h || 16 }), [frames, sprite]);
  const sheet = draft?.sheets.find((s) => s.id === selSheetId) || draft?.sheets[0] || null;
  const sheetRegions = useMemo(() => (draft?.regions || []).filter((r) => r.sheet === sheet?.id), [draft?.regions, sheet?.id]);
  const selRegion = draft?.regions.find((r) => r.id === selRegionId) || null;
  const selClipObj = draft?.clips.find((c) => c.name === selClip) || null;
  const src = sheet ? srcs[sheet.id] : null;

  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const changeRegion = (id, p) =>
    setDraft((d) => ({ ...d, regions: d.regions.map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  const addRegion = (r) => {
    const reg = { ...r, sheet: r.sheet || sheet?.id || "" };
    setDraft((d) => ({ ...d, regions: [...d.regions, reg] }));
    setSelRegionId(reg.id);
  };
  const deleteRegion = (id) => {
    setDraft((d) => ({ ...d, regions: d.regions.filter((r) => r.id !== id) }));
    setSelRegionId((cur) => (cur === id ? null : cur));
  };
  const selectRegion = (id) => {
    setSelRegionId(id);
    const r = draft?.regions.find((x) => x.id === id);
    if (r && r.sheet && r.sheet !== sheet?.id) setSelSheetId(r.sheet);
  };
  const pickFrame = (index) => {
    if (!selClipObj) {
      onToast("Select an animation first (right side), then click frames", true);
      return;
    }
    setDraft((d) => ({
      ...d,
      clips: d.clips.map((c) => (c.name === selClip ? { ...c, frames: [...c.frames, index] } : c)),
    }));
  };
  const renameClip = (oldName, raw) => {
    const name = cleanClipName(raw);
    setDraft((d) => {
      if (!name || (name !== oldName && d.clips.some((c) => c.name === name))) return d;
      return {
        ...d,
        clips: d.clips.map((c) => (c.name === oldName ? { ...c, name } : c)),
        triggers: d.triggers.map((t) => (t.clip === oldName ? { ...t, clip: name } : t)),
        idle_clip: d.idle_clip === oldName ? name : d.idle_clip,
      };
    });
    if (selClip === oldName && name) setSelClip(name);
  };
  const renameSheet = (id, name) =>
    setDraft((d) => ({ ...d, sheets: d.sheets.map((s) => (s.id === id ? { ...s, name: name.slice(0, 48) } : s)) }));

  // Apply the slicer to the current sheet: one repeated region, replacing that
  // sheet's regions or adding to them, plus an optional idle animation from
  // every frame of the sprite.
  const importSlice = (region, { replace, makeIdle }) => {
    const sid = slice?.sheetId || sheet?.id || "";
    const reg = { ...region, sheet: sid };
    setDraft((d) => {
      const regions = replace ? [...d.regions.filter((r) => r.sheet !== sid), reg] : [...d.regions, reg];
      const all = framesOf(regions).map((f) => f.index);
      let clips = d.clips;
      if (makeIdle) {
        const idle = { name: "idle", frames: all, fps: 6, loop: true };
        clips = clips.some((c) => c.name === "idle") ? clips.map((c) => (c.name === "idle" ? idle : c)) : [idle, ...clips];
      }
      return { ...d, regions, clips, idle_clip: makeIdle ? "idle" : d.idle_clip };
    });
    setSelRegionId(reg.id);
    if (makeIdle) setSelClip("idle");
    setSlice(null);
    onToast(`Sliced into ${reg.cols * reg.rows} frames`);
  };

  const save = useCallback(async () => {
    if (!sprite || !draft) return;
    setSaving(true);
    try {
      await api.updateSprite(sprite.id, patchFrom(draft));
      setSavedDraft(JSON.parse(JSON.stringify(draft)));
      onToast(`Saved "${draft.name}"`);
      onChanged();
    } catch (e) {
      onToast(`Save failed: ${e.message}`, true);
    } finally {
      setSaving(false);
    }
  }, [sprite, draft, onChanged, onToast]);
  const revert = () => savedDraft && setDraft(JSON.parse(JSON.stringify(savedDraft)));

  // Ctrl+S saves; R / F switch tools (outside inputs).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if (!typing && !e.ctrlKey && !e.metaKey && !slice) {
        if (e.key === "r" || e.key === "R") setTool("regions");
        if ((e.key === "f" || e.key === "F") && selClipObj) setTool("frames");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, selClipObj, slice]);

  const selectSprite = (id) => {
    if (id === selId) return;
    if (dirty && !confirm("Discard unsaved changes to this sprite?")) return;
    setSelId(id);
  };

  // New sprite from a sheet (one sprite per file).
  async function handleFiles(files) {
    if (!files || !files.length) return;
    setUploading(true);
    let last = null;
    try {
      for (const file of files) last = await api.uploadSprite(file);
      onToast(`Imported ${files.length} sprite(s) — now slice the sheet into frames`);
      await onChanged();
      if (last) {
        openSliceFor.current = { spriteId: last.id, sheetId: last.sheets?.[0]?.id };
        setSelId(last.id);
      }
    } catch (e) {
      onToast(`Import failed: ${e.message}`, true);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  // Extra sheet(s) for the selected sprite.
  async function handleSheetFiles(files) {
    if (!files || !files.length || !sprite) return;
    if (dirty && !confirm("Adding a sheet saves the sprite first. Continue?")) return;
    setUploading(true);
    try {
      if (dirty) await api.updateSprite(sprite.id, patchFrom(draft));
      let added = null;
      for (const file of files) {
        const r = await api.addSpriteSheet(sprite.id, file);
        added = r.added_sheet;
      }
      onToast(`Added ${files.length} sheet(s) — slice it into frames`);
      if (added) openSliceFor.current = { spriteId: sprite.id, sheetId: added };
      await onChanged();
    } catch (e) {
      onToast(`Add sheet failed: ${e.message}`, true);
    } finally {
      setUploading(false);
      if (sheetInput.current) sheetInput.current.value = "";
    }
  }
  async function removeSheet(sh) {
    const count = (draft?.regions || []).filter((r) => r.sheet === sh.id).length;
    if (!confirm(`Remove sheet "${sh.name}"${count ? ` and its ${count} region(s)` : ""}? Animations using its frames will be re-pointed.`)) return;
    try {
      await api.deleteSpriteSheet(sprite.id, sh.id);
      onToast("Sheet removed");
      await onChanged();
    } catch (e) {
      onToast(`Error: ${e.message}`, true);
    }
  }
  async function remove(sp) {
    if (!confirm(`Delete sprite "${sp.name}"? Scenes using it will show a placeholder.`)) return;
    try {
      await api.deleteSprite(sp.id);
      onToast("Deleted");
      await onChanged();
      if (selId === sp.id) setSelId(null);
    } catch (e) {
      onToast(`Error: ${e.message}`, true);
    }
  }

  const isCustomKey = draft && draft.transparent !== "auto" && draft.transparent !== "none";
  const bounds = selRegion ? regionBounds(selRegion) : null;

  const list = (
    <div className="studio-list">
      <div
        className="dropzone small"
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        {uploading ? "Uploading…" : "New sprite from a sheet (PNG) — drop or click"}
        <input ref={fileInput} type="file" accept="image/png,image/gif,image/webp,image/bmp" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      </div>
      <div className="sprite-rows" role="listbox" aria-label="Sprites">
        {sprites.length === 0 && <p className="field-hint">No sprites yet — import a sheet to start.</p>}
        {sprites.map((sp) => (
          <div
            key={sp.id}
            role="option"
            aria-selected={sp.id === selId}
            tabIndex={0}
            className={`sprite-row ${sp.id === selId ? "sel" : ""}`}
            onClick={() => selectSprite(sp.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && selectSprite(sp.id)}
          >
            <img src={api.spriteThumbUrl(sp.id, sp.version)} alt="" className="sprite-row-thumb" />
            <span className="sprite-row-name">
              {sp.name}
              <small className="muted">
                {(sp.sheets || []).length} sheet{(sp.sheets || []).length === 1 ? "" : "s"} · {sp.frame_count} frames · {Object.keys(sp.clips || {}).length} anims
              </small>
            </span>
            <button className="tiny-x" aria-label={`Delete ${sp.name}`} onClick={(e) => { e.stopPropagation(); remove(sp); }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );

  if (!sprite || !draft) {
    return (
      <div className={`studio ${mobile ? "mobile" : ""}`}>
        <div className="studio-head">
          <h2><Icon name="sprite" /> Sprite Studio</h2>
        </div>
        <div className="studio-empty">
          {list}
          <div className="studio-intro">
            <h3>Turn sprite sheets into a panel character</h3>
            <ol>
              <li><b>Import</b> a sheet (PNG with transparency is ideal). A sprite can hold several sheets — add more from its Sheets list.</li>
              <li><b>Slice</b> each sheet: origin, tile width/height, columns, rows, padding — like Aseprite's Import Sprite Sheet. Draw extra regions by hand for odd layouts.</li>
              <li>Build <b>animations</b> by clicking frames in play order; frames from every sheet share one numbering, so an animation can mix sheets.</li>
              <li>On each animation, set <b>when it plays</b>: music, a notification, a new track, a value threshold, or a time of day.</li>
              <li>Save, then place it from the scene editor's <b>Sprites</b> tab.</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  const sheetsPanel = (
    <div className="settings-section studio-sheets">
      <h4>Sheets <span className="muted small">({draft.sheets.length})</span></h4>
      <div className="sheet-rows" role="listbox" aria-label="Sheets of this sprite">
        {draft.sheets.map((sh) => {
          const n = draft.regions.filter((r) => r.sheet === sh.id).reduce((a, r) => a + r.cols * r.rows, 0);
          const isSel = sh.id === sheet?.id;
          return (
            <div
              key={sh.id}
              role="option"
              aria-selected={isSel}
              tabIndex={0}
              className={`sheet-row ${isSel ? "sel" : ""}`}
              onClick={() => setSelSheetId(sh.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && setSelSheetId(sh.id)}
            >
              <span className="sheet-row-thumb">
                {srcs[sh.id] ? <FrameThumb src={srcs[sh.id]} frame={{ x: 0, y: 0, w: sh.w, h: sh.h }} size={32} /> : null}
              </span>
              <span className="sheet-row-main">
                <input
                  type="text"
                  value={sh.name}
                  aria-label="Sheet name"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => renameSheet(sh.id, e.target.value)}
                />
                <small className="muted">{sh.w}×{sh.h} · {n} frame{n === 1 ? "" : "s"}</small>
              </span>
              <button
                className="tiny-x"
                aria-label={`Remove sheet ${sh.name}`}
                title={draft.sheets.length <= 1 ? "A sprite needs at least one sheet" : "Remove sheet"}
                disabled={draft.sheets.length <= 1}
                onClick={(e) => {
                  e.stopPropagation();
                  removeSheet(sh);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div
        className="dropzone small"
        onClick={() => sheetInput.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleSheetFiles(e.dataTransfer.files);
        }}
      >
        {uploading ? "Uploading…" : "+ Add a sheet to this sprite"}
        <input ref={sheetInput} type="file" accept="image/png,image/gif,image/webp,image/bmp" multiple hidden onChange={(e) => handleSheetFiles(e.target.files)} />
      </div>
      {sheet && (
        <button className="primary wide" onClick={() => setSlice({ initial: sheetRegions[0] || null, sheetId: sheet.id })}>
          <Icon name="crop" size={14} /> Slice "{sheet.name}"…
        </button>
      )}
    </div>
  );

  const spriteSettings = (
    <div className="settings-section studio-sheet">
      <h4>Sprite</h4>
      <div className="control">
        <label>Name</label>
        <input type="text" value={draft.name} onChange={(e) => setField("name", e.target.value)} />
      </div>
      <div className="control">
        <label>Transparency (all sheets)</label>
        <div className="row2">
          <select value={isCustomKey ? "custom" : draft.transparent} onChange={(e) => setField("transparent", e.target.value === "custom" ? "#ff00ff" : e.target.value)}>
            <option value="auto">Auto (alpha, else top-left colour)</option>
            <option value="none">None (opaque)</option>
            <option value="custom">Key a colour…</option>
          </select>
          {isCustomKey && <input type="color" value={draft.transparent} onChange={(e) => setField("transparent", e.target.value)} aria-label="Key colour" />}
        </div>
      </div>
      <div className="control">
        <label>Anchor <span className="val">box {box.w}×{box.h}</span></label>
        <select value={draft.anchor} onChange={(e) => setField("anchor", e.target.value)}>
          {ANCHORS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <p className="field-hint">Where smaller frames sit inside the widget box (the largest frame across all sheets).</p>
      </div>
    </div>
  );

  const regionPanel = (
    <div className="settings-section studio-region">
      <h4>Regions on this sheet <span className="muted small">({sheetRegions.length} · {frames.length} frames total)</span></h4>
      <div className="region-chips">
        {sheetRegions.map((r, i) => (
          <button key={r.id} className={`chip ${r.id === selRegionId ? "active" : ""}`} onClick={() => { selectRegion(r.id); setTool("regions"); }}>
            {r.name || `region ${i + 1}`} <small>{r.cols * r.rows}f</small>
          </button>
        ))}
        {sheetRegions.length === 0 && <p className="field-hint">Use <b>Slice</b> above, or drag on the sheet to crop a region by hand.</p>}
      </div>
      {selRegion && selRegion.sheet === sheet?.id && (
        <>
          <div className="control">
            <label>Name</label>
            <input type="text" value={selRegion.name || ""} placeholder="e.g. walk row" onChange={(e) => changeRegion(selRegion.id, { name: e.target.value.slice(0, 32) })} />
          </div>
          <div className="control">
            <label>X, Y · W, H (one tile)</label>
            <div className="row4">
              <NumInput min={0} value={selRegion.x} onChange={(n) => changeRegion(selRegion.id, { x: n })} aria-label="x" />
              <NumInput min={0} value={selRegion.y} onChange={(n) => changeRegion(selRegion.id, { y: n })} aria-label="y" />
              <NumInput min={1} value={selRegion.w} onChange={(n) => changeRegion(selRegion.id, { w: n })} aria-label="width" />
              <NumInput min={1} value={selRegion.h} onChange={(n) => changeRegion(selRegion.id, { h: n })} aria-label="height" />
            </div>
          </div>
          <div className="control">
            <label>Columns, rows · padding x, y</label>
            <div className="row4">
              <NumInput min={1} max={256} value={selRegion.cols} onChange={(n) => changeRegion(selRegion.id, { cols: n })} aria-label="columns" />
              <NumInput min={1} max={256} value={selRegion.rows} onChange={(n) => changeRegion(selRegion.id, { rows: n })} aria-label="rows" />
              <NumInput min={0} value={selRegion.gap_x} onChange={(n) => changeRegion(selRegion.id, { gap_x: n })} aria-label="padding x" />
              <NumInput min={0} value={selRegion.gap_y} onChange={(n) => changeRegion(selRegion.id, { gap_y: n })} aria-label="padding y" />
            </div>
          </div>
          <div className="control">
            <label>Numbering</label>
            <select value={selRegion.order === "cols" ? "cols" : "rows"} onChange={(e) => changeRegion(selRegion.id, { order: e.target.value })}>
              <option value="rows">By rows</option>
              <option value="cols">By columns</option>
            </select>
          </div>
          <p className="field-hint">
            {selRegion.cols * selRegion.rows} frame{selRegion.cols * selRegion.rows === 1 ? "" : "s"}
            {bounds ? ` · covers ${bounds.w}×${bounds.h}px` : ""}.{" "}
            <button className="linklike" onClick={() => setSlice({ initial: selRegion, sheetId: sheet.id })}>Open in slicer</button>
          </p>
          <button className="danger" onClick={() => deleteRegion(selRegion.id)}>Remove region</button>
        </>
      )}
    </div>
  );

  const frameStrip = (
    <div className="frame-strip" aria-label="All frames">
      {frames.length === 0 && <span className="muted small">No frames yet — slice a sheet.</span>}
      {frames.map((f) => {
        const uses = selClipObj ? selClipObj.frames.filter((i) => i === f.index).length : 0;
        const sh = draft.sheets.find((s) => s.id === f.sheet);
        return (
          <button
            key={f.index}
            className={`strip-frame ${uses ? "in" : ""} ${f.sheet !== sheet?.id ? "other-sheet" : ""}`}
            onClick={() => pickFrame(f.index)}
            title={`frame ${f.index} (${f.w}×${f.h}${sh ? `, ${sh.name}` : ""}) — click to add to ${selClip || "the selected animation"}`}
          >
            <FrameThumb src={srcs[f.sheet]} frame={f} size={34} />
            <span className="mono">{f.index}{uses ? ` ·${uses}` : ""}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`studio ${mobile ? "mobile" : ""}`}>
      <div className="studio-head">
        <h2><Icon name="sprite" /> Sprite Studio</h2>
        <span className={`studio-state ${dirty ? "dirty" : ""}`}>{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <span className="studio-actions">
          <button onClick={revert} disabled={!dirty}>Revert</button>
          <button className="primary" onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save sprite"}</button>
        </span>
      </div>

      <div className="studio-body" ref={bodyRef}>
        <aside className="studio-left" style={mobile ? undefined : { width: leftW }}>
          {list}
          {sheetsPanel}
          {spriteSettings}
          {regionPanel}
        </aside>
        {!mobile && <Resizer onDrag={dragLeft} />}

        <section className="studio-center">
          {sheet ? (
            <SheetCanvas
              src={src}
              sheetId={sheet.id}
              sheetW={sheet.w}
              sheetH={sheet.h}
              regions={sheetRegions}
              frames={frames}
              selRegionId={selRegionId}
              onSelectRegion={setSelRegionId}
              onChangeRegion={changeRegion}
              onAddRegion={addRegion}
              onDeleteRegion={deleteRegion}
              tool={tool}
              onTool={setTool}
              clipFrames={selClipObj ? selClipObj.frames : []}
              onPickFrame={pickFrame}
              hasClip={Boolean(selClipObj)}
            />
          ) : (
            <div className="sheet-empty muted">This sprite has no sheets.</div>
          )}
          {frameStrip}
        </section>

        {!mobile && <Resizer onDrag={dragRight} />}
        <aside className="studio-right" style={mobile ? undefined : { width: rightW }}>
          <AnimationsPanel
            clips={draft.clips}
            selClip={selClip}
            onSelectClip={(n) => { setSelClip(n); if (n) setTool("frames"); }}
            onChangeClips={(clips) => setField("clips", clips)}
            onRenameClip={renameClip}
            triggers={draft.triggers}
            onChangeTriggers={(t) => setField("triggers", t)}
            idleClip={draft.idle_clip}
            onIdleChange={(v) => setField("idle_clip", v)}
            frames={frames}
            srcs={srcs}
            box={box}
            anchor={draft.anchor}
          />
        </aside>
      </div>

      {slice && sheet && (
        <SliceDialog
          src={srcs[slice.sheetId] || src}
          sheetW={(draft.sheets.find((s) => s.id === slice.sheetId) || sheet).w}
          sheetH={(draft.sheets.find((s) => s.id === slice.sheetId) || sheet).h}
          initial={slice.initial}
          hasFrames={draft.regions.some((r) => r.sheet === slice.sheetId)}
          hasClips={draft.clips.some((c) => c.frames.length > 0)}
          onImport={importSlice}
          onClose={() => setSlice(null)}
        />
      )}
    </div>
  );
}
