import React, { useEffect, useRef, useState } from "react";
import Icon from "../Icon.jsx";
import FrameThumb from "./FrameThumb.jsx";
import NumInput from "./NumInput.jsx";
import { EVENT_LABELS, PRESET_CLIPS, TRIGGER_EVENTS, anchorOffset, cleanClipName, newId } from "./spriteGeom.js";

const OPS = ["<", "<=", ">", ">=", "==", "!="];

// A live player for one animation, drawn into the sprite's widget box. Any
// children render beside the preview; the transport (play/scrub) sits below,
// full width, so the slider never squeezes the column next to the canvas.
function ClipPlayer({ srcs, frames, clip, box, anchor, size = 96, controls = false, children }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [scrub, setScrub] = useState(0);
  const list = clip.frames.length ? clip.frames : [];
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !srcs || !box) return undefined;
    const k = Math.min(size / box.w, size / box.h);
    const pz = k >= 1 ? Math.max(1, Math.floor(k)) : k;
    cv.width = Math.max(1, Math.round(box.w * pz));
    cv.height = Math.max(1, Math.round(box.h * pz));
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const drawFrame = (i) => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      const f = frames[list[i]];
      const img = f && srcs[f.sheet];
      if (!f || !img) return;
      const { ox, oy } = anchorOffset(anchor, box.w, box.h, f.w, f.h);
      ctx.drawImage(img, f.x, f.y, f.w, f.h, Math.round(ox * pz), Math.round(oy * pz), Math.round(f.w * pz), Math.round(f.h * pz));
    };
    if (!list.length) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      return undefined;
    }
    if (!playing) {
      drawFrame(Math.min(list.length - 1, scrub));
      return undefined;
    }
    const fps = Math.max(0.5, Number(clip.fps) || 6);
    const loop = clip.loop !== false;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const step = Math.floor(((now - t0) / 1000) * fps);
      const i = loop ? step % list.length : Math.min(list.length - 1, step);
      setScrub(i);
      drawFrame(i);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [srcs, frames, box, anchor, size, clip.fps, clip.loop, list.join(","), playing, playing ? 0 : scrub]);

  return (
    <div className="clip-player-box">
      <div className="clip-player-row">
        <div className="clip-preview-frame" style={{ width: size, height: size }}>
          <canvas ref={ref} className="clip-preview" aria-label="Animation preview" />
        </div>
        {children && <div className="clip-player-side">{children}</div>}
      </div>
      {controls && (
        <div className="clip-transport">
          <button className="icon-btn" onClick={() => setPlaying((p) => !p)} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>
            <Icon name={playing ? "pause" : "play"} size={14} />
          </button>
          <input
            type="range"
            min="0"
            max={Math.max(0, list.length - 1)}
            value={Math.min(scrub, Math.max(0, list.length - 1))}
            onChange={(e) => {
              setPlaying(false);
              setScrub(Number(e.target.value));
            }}
            aria-label="Scrub frames"
            disabled={list.length < 2}
          />
          <span className="mono small nowrap">{list.length ? Math.min(scrub, list.length - 1) + 1 : 0}/{list.length}</span>
        </div>
      )}
    </div>
  );
}

// One trigger rule inside an animation card.
function TriggerRow({ t, onChange, onRemove }) {
  const setParam = (p) => onChange({ params: { ...(t.params || {}), ...p } });
  return (
    <div className="trigger-row">
      <div className="trigger-main">
        <select value={t.event} onChange={(e) => onChange({ event: e.target.value })} aria-label="Event">
          {TRIGGER_EVENTS.map((ev) => (
            <option key={ev} value={ev}>{EVENT_LABELS[ev]}</option>
          ))}
        </select>
        {t.event === "track" && (
          <label className="inline-field">
            for <NumInput min={1} max={60} value={t.params?.seconds ?? 6} onChange={(n) => setParam({ seconds: n })} /> s after a track starts
          </label>
        )}
        {t.event === "value" && (
          <div className="row3">
            <input type="text" placeholder="value name" value={t.params?.name ?? ""} onChange={(e) => setParam({ name: e.target.value })} aria-label="Value name" />
            <select value={t.params?.op ?? "<"} onChange={(e) => setParam({ op: e.target.value })} aria-label="Comparison">
              {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input type="text" placeholder="threshold" value={t.params?.value ?? ""} onChange={(e) => setParam({ value: e.target.value })} aria-label="Threshold" />
          </div>
        )}
        {t.event === "time" && (
          <div className="row2">
            <label className="inline-field">from <input type="time" value={t.params?.from ?? "23:00"} onChange={(e) => setParam({ from: e.target.value })} /></label>
            <label className="inline-field">to <input type="time" value={t.params?.to ?? "07:00"} onChange={(e) => setParam({ to: e.target.value })} /></label>
          </div>
        )}
      </div>
      <button className="tiny-x" onClick={onRemove} aria-label="Remove trigger">×</button>
    </div>
  );
}

// Animations: one card per clip with its own live preview, timing, frame
// timeline, and the triggers that play it. The idle animation is the fallback.
export default function AnimationsPanel({
  clips,
  selClip,
  onSelectClip,
  onChangeClips,
  onRenameClip,
  triggers,
  onChangeTriggers,
  idleClip,
  onIdleChange,
  frames,
  srcs,
  box,
  anchor,
}) {
  const [newName, setNewName] = useState("");
  const patch = (name, p) => onChangeClips(clips.map((c) => (c.name === name ? { ...c, ...p } : c)));
  const addClip = (raw) => {
    const name = cleanClipName(raw);
    if (!name) return;
    if (!clips.some((c) => c.name === name)) onChangeClips([...clips, { name, frames: [], fps: 6, loop: true }]);
    onSelectClip(name);
    setNewName("");
  };
  const removeClip = (name) => {
    onChangeClips(clips.filter((c) => c.name !== name));
    onChangeTriggers(triggers.filter((t) => t.clip !== name));
    if (selClip === name) onSelectClip(null);
  };
  const moveFrame = (c, i, dir) => {
    const arr = [...c.frames];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    patch(c.name, { frames: arr });
  };
  const addTrigger = (clipName, event) => {
    const params = event === "track" ? { seconds: 6 } : event === "value" ? { name: "battery", op: "<", value: 20 } : event === "time" ? { from: "23:00", to: "07:00" } : {};
    onChangeTriggers([...triggers, { id: newId(), event, clip: clipName, params }]);
  };
  const unused = PRESET_CLIPS.filter((p) => !clips.some((c) => c.name === p));

  return (
    <div className="settings-section studio-anims">
      <h4>Animations</h4>
      <p className="field-hint">
        Each animation plays for the events listed on its card. Priority: say › notification › new track › music › value › time;
        the idle animation is the fallback. Select a card, then click frames on the sheet (Frames tool) to add them.
      </p>

      <div className="anim-cards">
        {clips.length === 0 && <p className="field-hint">No animations yet — add one below.</p>}
        {clips.map((c) => {
          const isSel = c.name === selClip;
          const mine = triggers.filter((t) => t.clip === c.name);
          return (
            <div
              key={c.name}
              className={`anim-card ${isSel ? "sel" : ""}`}
              onClick={() => !isSel && onSelectClip(c.name)}
              role="button"
              tabIndex={0}
              aria-current={isSel ? "true" : undefined}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && onSelectClip(c.name)}
            >
              <div className="anim-card-head" onClick={(e) => isSel && e.stopPropagation()}>
                <input
                  type="text"
                  className="clip-name-input"
                  value={c.name}
                  aria-label="Animation name"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onRenameClip(c.name, e.target.value)}
                />
                {idleClip === c.name && <span className="badge-idle" title="Plays when nothing else is happening">idle</span>}
                <span className="muted small nowrap">{c.frames.length}f · {mine.length} trig</span>
                <button
                  className="tiny-x"
                  aria-label={`Delete animation ${c.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete animation "${c.name}"?`)) removeClip(c.name);
                  }}
                >
                  ×
                </button>
              </div>
              <ClipPlayer srcs={srcs} frames={frames} clip={c} box={box} anchor={anchor} size={isSel ? 96 : 48} controls={isSel}>
                <div className="anim-card-meta" onClick={(e) => e.stopPropagation()}>
                  <label className="inline-field nowrap">
                    fps <NumInput min={0.5} max={60} step="0.5" value={c.fps} onChange={(n) => patch(c.name, { fps: n })} />
                  </label>
                  <label className="checkbox inline nowrap">
                    <input type="checkbox" checked={c.loop !== false} onChange={(e) => patch(c.name, { loop: e.target.checked })} /> loop
                  </label>
                  <label className="checkbox inline nowrap" title="Plays when nothing else is happening">
                    <input type="radio" name="idle-clip" checked={idleClip === c.name} onChange={() => onIdleChange(c.name)} /> idle (default)
                  </label>
                  {!isSel && mine.length > 0 && (
                    <span className="muted small">{mine.map((t) => EVENT_LABELS[t.event]).join(", ")}</span>
                  )}
                </div>
              </ClipPlayer>

              {isSel && (
                <div className="anim-card-body" onClick={(e) => e.stopPropagation()}>
                  <h5>Frames</h5>
                  <div className="timeline" role="list" aria-label={`Frames of ${c.name}`}>
                    {c.frames.length === 0 && (
                      <p className="field-hint">Empty — use the <b>Frames</b> tool and click frames on the sheet, or the strip below the sheet.</p>
                    )}
                    {c.frames.map((fi, i) => (
                      <div key={`${i}-${fi}`} className="tl-frame" role="listitem">
                        <FrameThumb src={srcs[frames[fi]?.sheet]} frame={frames[fi]} size={36} title={`frame ${fi}`} />
                        <span className="tl-idx mono">{fi}</span>
                        <span className="tl-actions">
                          <button className="icon-btn" onClick={() => moveFrame(c, i, -1)} disabled={i === 0} title="Earlier" aria-label="Move earlier"><Icon name="chevronLeft" size={12} /></button>
                          <button className="icon-btn" onClick={() => moveFrame(c, i, 1)} disabled={i === c.frames.length - 1} title="Later" aria-label="Move later"><Icon name="chevronRight" size={12} /></button>
                          <button className="icon-btn danger" onClick={() => patch(c.name, { frames: c.frames.filter((_, k) => k !== i) })} title="Remove" aria-label="Remove frame"><Icon name="close" size={12} /></button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="row-wrap">
                    <button className="linklike" onClick={() => patch(c.name, { frames: frames.map((f) => f.index) })}>All frames</button>
                    <button className="linklike" onClick={() => patch(c.name, { frames: [...c.frames].reverse() })} disabled={c.frames.length < 2}>Reverse</button>
                    <button className="linklike" onClick={() => patch(c.name, { frames: [...c.frames, ...[...c.frames].reverse().slice(1, -1)] })} disabled={c.frames.length < 3} title="Play forward then back">Ping-pong</button>
                    <button className="linklike" onClick={() => patch(c.name, { frames: c.frames.slice(0, -1) })} disabled={!c.frames.length}>Remove last</button>
                    <button className="linklike" onClick={() => patch(c.name, { frames: [] })} disabled={!c.frames.length}>Clear</button>
                  </div>

                  <h5>Plays when</h5>
                  <div className="trigger-list">
                    {mine.length === 0 && (
                      <p className="field-hint">{idleClip === c.name ? "This is the idle animation — it plays whenever nothing else does." : "No triggers — this animation only plays if told to by name (e.g. /api/sprite/say with clip)."}</p>
                    )}
                    {mine.map((t) => (
                      <TriggerRow
                        key={t.id}
                        t={t}
                        onChange={(p) => onChangeTriggers(triggers.map((x) => (x.id === t.id ? { ...x, ...p } : x)))}
                        onRemove={() => onChangeTriggers(triggers.filter((x) => x.id !== t.id))}
                      />
                    ))}
                  </div>
                  <div className="row-wrap">
                    <span className="muted small">Add:</span>
                    {TRIGGER_EVENTS.map((ev) => (
                      <button key={ev} className="linklike" onClick={() => addTrigger(c.name, ev)}>{EVENT_LABELS[ev]}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="control">
        <div className="row2">
          <input
            type="text"
            list="clip-presets"
            placeholder="new animation (idle, talk, dance…)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addClip(newName)}
          />
          <button onClick={() => addClip(newName)} disabled={!cleanClipName(newName)}><Icon name="plus" size={14} /> Add</button>
        </div>
        <datalist id="clip-presets">
          {unused.map((p) => <option key={p} value={p} />)}
        </datalist>
        {unused.length > 0 && (
          <p className="field-hint">
            Quick add:{" "}
            {unused.map((p) => (
              <button key={p} className="linklike" onClick={() => addClip(p)}>{p}</button>
            ))}
          </p>
        )}
      </div>
      <p className="field-hint">Values come from <code>POST /api/scene/value</code> (the web app pushes <code>battery</code>).</p>
    </div>
  );
}
