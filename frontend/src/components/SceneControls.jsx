import React, { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import RangeInput from "./RangeInput.jsx";
import { api } from "../api.js";
import CropModal from "./CropModal.jsx";
import { SPRITE_BUBBLE_DEFAULTS, SPRITE_PRESENCE_DEFAULTS } from "../hooks/useScene.js";
import NumInput from "./studio/NumInput.jsx";

const EVENT_SHORT = {
  say: "say", notification: "notification", track: "new track", music: "music", value: "value", time: "time",
};

export const MUSIC_PROVIDERS = [
  { v: "browser", l: "Browser" },
  { v: "lastfm", l: "Last.fm" },
  { v: "plex", l: "Plex" },
  { v: "vlc", l: "VLC" },
  { v: "none", l: "Off" },
];

// Left-pane controls for the scene: background, add widgets, per-widget config,
// weather location, and save/enable. Shares state via the `sc` scene hook object.
export default function SceneControls({ sc, cols, rows, media, music, fonts, sprites, onOpenStudio }) {
  const [weather, setWeather] = useState({ lat: 0, lon: 0, unit: "fahrenheit" });
  const [cropWidget, setCropWidget] = useState(null);
  const [sceneName, setSceneName] = useState("");
  const [sayText, setSayText] = useState("Hello!");

  useEffect(() => {
    api
      .getSettings()
      .then((s) =>
        setWeather({ lat: s.weather_lat ?? 0, lon: s.weather_lon ?? 0, unit: s.weather_unit || "fahrenheit" })
      )
      .catch(() => {});
  }, []);

  const { scene } = sc;
  const sel = scene.widgets.find((w) => w.id === sc.selId) || null;
  const fontList = fonts && fonts.length ? fonts : [{ name: "5x7", height: 7 }];
  const selFontH = (fontList.find((f) => f.name === (sel?.config?.font || "5x7")) || {}).height || 7;

  return (
    <>
    <div className="scene-controls">
      <h3><Icon name="sliders" /> Scene</h3>
      <div className="actions">
        <button
          className="primary"
          onClick={() =>
            sc.save({
              weather_lat: Number(weather.lat),
              weather_lon: Number(weather.lon),
              weather_unit: weather.unit,
            })
          }
        >
          Save{sc.dirty ? " •" : ""}
        </button>
        <button className={scene.enabled ? "primary" : ""} onClick={sc.toggle}>
          {scene.enabled ? "Turn off" : "Show on panel"}
        </button>
      </div>
      <p className="field-hint save-note">
        {sc.dirty
          ? "Unsaved edits — Save (or Show on panel) writes them to the Pi."
          : scene.enabled
          ? "Live on the panel · all changes saved."
          : "All changes saved · not shown on the panel yet."}
      </p>

      <div className="settings-section">
        <h4>Music mode</h4>
        <label className="checkbox">
          <input type="checkbox" checked={Boolean(scene.music?.enabled)} onChange={(e) => sc.setMusicMode(e.target.checked)} />
          When a track plays, fade into fullscreen album art
        </label>
        <p className="field-hint">
          Art is cropped to fill the panel and fades back to this scene when playback stops. Needs a Music source (header ▸ Music).
        </p>
        <div className="control">
          <label>Art style · transition (s)</label>
          <div className="row2">
            <select value={scene.music?.style || "cover"} onChange={(e) => sc.updateMusic({ style: e.target.value })}>
              <option value="cover">Cover (fill the panel)</option>
              <option value="disc">Spinning disc</option>
              <option value="visualizer">Visualizer (gradient in the art's colours)</option>
            </select>
            <NumInput min={0} max={10} step="0.1" value={(scene.music?.transition_ms ?? 800) / 1000} onChange={(n) => sc.updateMusic({ transition_ms: Math.round(n * 1000) })} aria-label="transition seconds" />
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={scene.music?.title !== false} onChange={(e) => sc.updateMusic({ title: e.target.checked })} />
          Show track title &amp; artist
        </label>
        <div className="control">
          <label>Waveform · colour</label>
          <div className="row2">
            <select value={scene.music?.waveform || "auto"} onChange={(e) => sc.updateMusic({ waveform: e.target.value })}>
              <option value="off">Off</option>
              <option value="auto">Live audio, else synthesized</option>
              <option value="live">Live audio only</option>
            </select>
            <input type="color" value={scene.music?.wave_color || "#FFFFFF"} onChange={(e) => sc.updateMusic({ wave_color: e.target.value })} aria-label="waveform colour" />
          </div>
          <p className="field-hint">Live levels come from the browser: header ▸ Music ▸ "Send audio levels".</p>
        </div>
        <Slider label="Waveform height" value={scene.music?.wave_height ?? 0.35} min={0.1} max={0.9}
          onChange={(v) => sc.updateMusic({ wave_height: v })} />
        <Slider label="Dim art" value={scene.music?.dim ?? 0} min={0} max={0.8}
          onChange={(v) => sc.updateMusic({ dim: v })} />
        <label className="checkbox" title="Render the music view in the editor even with nothing playing">
          <input type="checkbox" checked={Boolean(sc.musicPreview)} onChange={(e) => sc.setMusicPreview(e.target.checked)} />
          Preview music mode in the editor
        </label>
      </div>

      <div className="settings-section">
        <h4>Background</h4>
        <div className="control">
          <label>Type</label>
          <select
            value={scene.background.type}
            onChange={(e) => sc.setBackground({ type: e.target.value })}
          >
            <option value="none">None (black)</option>
            <option value="color">Solid color</option>
            <option value="media">Image / GIF</option>
          </select>
        </div>
        {scene.background.type === "color" && (
          <div className="control">
            <label>Color</label>
            <input
              type="color"
              value={scene.background.color}
              onChange={(e) => sc.setBackground({ color: e.target.value })}
            />
          </div>
        )}
        {scene.background.type === "media" && (
          <div className="control">
            <label>Media</label>
            <select
              value={scene.background.media_id || ""}
              onChange={(e) => sc.setBackground({ media_id: e.target.value || null })}
            >
              <option value="">— pick —</option>
              {(media || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h4>Add widget</h4>
        <div className="widget-add">
          <button onClick={() => sc.addWidget("image", cols, rows)}><Icon name="image" /> Image</button>
          <button onClick={() => sc.addWidget("clock", cols, rows)}><Icon name="clock" /> Clock</button>
          <button onClick={() => sc.addWidget("text", cols, rows)}><Icon name="text" /> Text</button>
          <button onClick={() => sc.addWidget("weather", cols, rows)}><Icon name="weather" /> Weather</button>
          <button onClick={() => sc.addWidget("value", cols, rows)}><Icon name="value" /> Value</button>
          <button onClick={() => sc.addWidget("music", cols, rows)}><Icon name="music" /> Album art</button>
          <button onClick={() => sc.addWidget("nowplaying", cols, rows)}><Icon name="nowplaying" /> Now playing</button>
          <button onClick={() => sc.addWidget("sprite", cols, rows)}><Icon name="sprite" /> Sprite</button>
        </div>
        <p className="field-hint">Or click a library image / saved sprite above to drop it in.</p>
      </div>

      {sel && (
        <div className="settings-section">
          <h4>{sel.type} widget</h4>
          {sel.type === "clock" && (
            <div className="control">
              <label>Format</label>
              <select
                value={sel.config.format}
                onChange={(e) => sc.updateConfig(sel.id, { format: e.target.value })}
              >
                <option value="%H:%M">24h HH:MM</option>
                <option value="%H:%M:%S">24h HH:MM:SS</option>
                <option value="%I:%M">12h HH:MM</option>
                <option value="%I:%M %p">12h HH:MM AM</option>
              </select>
            </div>
          )}
          {sel.type === "text" && (
            <div className="control">
              <label>Text</label>
              <input
                type="text"
                value={sel.config.text || ""}
                onChange={(e) => sc.updateConfig(sel.id, { text: e.target.value })}
              />
            </div>
          )}
          {sel.type === "value" && (
            <>
              <div className="control">
                <label>Value name (e.g. battery)</label>
                <input
                  type="text"
                  value={sel.config.name || ""}
                  onChange={(e) => sc.updateConfig(sel.id, { name: e.target.value })}
                />
              </div>
              <div className="control">
                <label>Label / suffix</label>
                <div className="row2">
                  <input
                    type="text"
                    placeholder="label"
                    value={sel.config.label || ""}
                    onChange={(e) => sc.updateConfig(sel.id, { label: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="suffix"
                    value={sel.config.suffix || ""}
                    onChange={(e) => sc.updateConfig(sel.id, { suffix: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}
          {sel.type === "weather" && (
            <p className="field-hint">Set your location in the Weather box below.</p>
          )}
          {sel.type === "image" && (
            <>
              <div className="control">
                <label>Image</label>
                <select
                  value={sel.config.media_id || ""}
                  onChange={(e) => sc.updateConfig(sel.id, { media_id: e.target.value || null })}
                >
                  <option value="">— pick —</option>
                  {(media || []).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="control">
                <label>Size (w × h)</label>
                <div className="row2">
                  <input type="number" min="1" max={cols} value={sel.config.w || cols}
                    onChange={(e) => sc.updateConfig(sel.id, { w: Number(e.target.value) })} />
                  <input type="number" min="1" max={rows} value={sel.config.h || rows}
                    onChange={(e) => sc.updateConfig(sel.id, { h: Number(e.target.value) })} />
                </div>
              </div>
              <div className="control">
                <label>Fit</label>
                <select value={sel.config.fit || "cover"}
                  onChange={(e) => {
                    const fit = e.target.value;
                    const patch = { fit };
                    if (fit === "center" || fit === "integer") {
                      const item = (media || []).find((m) => m.id === sel.config.media_id);
                      const zoom = fit === "integer" ? Math.max(1, sel.config.zoom || 1) : 1;
                      patch.off_x = Math.round(((sel.config.w || 0) - (item?.width || 0) * zoom) / 2);
                      patch.off_y = Math.round(((sel.config.h || 0) - (item?.height || 0) * zoom) / 2);
                    }
                    sc.updateConfig(sel.id, patch);
                  }}>
                  <option value="cover">Cover (fill, crop)</option>
                  <option value="contain">Contain (letterbox)</option>
                  <option value="center">Native 1:1 (viewport)</option>
                  <option value="integer">Integer zoom (viewport)</option>
                  <option value="stretch">Stretch</option>
                </select>
              </div>
              {(sel.config.fit === "center" || sel.config.fit === "integer") && (
                <>
                  {sel.config.fit === "integer" && (
                    <div className="control">
                      <label>Zoom (×{Math.max(1, sel.config.zoom || 1)})</label>
                      <input type="number" min="1" max="16" value={sel.config.zoom || 1}
                        onChange={(e) => sc.updateConfig(sel.id, { zoom: Math.max(1, Number(e.target.value)) })} />
                    </div>
                  )}
                  <p className="field-hint">
                    Viewport: drag inside the box to pan the image, edges to move the box,
                    corners to crop. <button className="linklike" style={{ padding: 0 }}
                      onClick={() => sc.updateConfig(sel.id, { off_x: 0, off_y: 0 })}>Reset pan</button>
                  </p>
                </>
              )}
              <Slider label="Brightness" value={sel.config.brightness ?? 1}
                onChange={(v) => sc.updateConfig(sel.id, { brightness: v })} />
              <Slider label="Contrast" value={sel.config.contrast ?? 1}
                onChange={(v) => sc.updateConfig(sel.id, { contrast: v })} />
              <Slider label="Saturation" value={sel.config.saturation ?? 1} min={0}
                onChange={(v) => sc.updateConfig(sel.id, { saturation: v })} />
              <label className="checkbox">
                <input type="checkbox" checked={sel.config.nearest || false}
                  onChange={(e) => sc.updateConfig(sel.id, { nearest: e.target.checked })} />
                Crisp pixels (no smoothing)
              </label>
              <button
                onClick={() => setCropWidget(sel)}
                disabled={!sel.config.media_id}
              >
                Crop / pixel-lock…
              </button>
            </>
          )}

          {(sel.type === "music" || sel.type === "nowplaying") && (
            <>
              <div className="control">
                <label>Source (player)</label>
                <select
                  value={music?.provider || "none"}
                  onChange={(e) => music?.setProvider(e.target.value)}
                >
                  {MUSIC_PROVIDERS.map((p) => (
                    <option key={p.v} value={p.v}>{p.l}</option>
                  ))}
                </select>
              </div>
              <p className="field-hint">
                {music?.playing
                  ? `▶ ${[music.artist, music.title].filter(Boolean).join(" – ") || "playing"}`
                  : music?.provider && music.provider !== "none"
                  ? "Source on — waiting for a track…"
                  : "Pick a source to feed the widget."}
              </p>
            </>
          )}

          {sel.type === "music" && (
            <>
              <div className="control">
                <label>Size (w × h)</label>
                <div className="row2">
                  <input type="number" min="1" max={cols} value={sel.config.w || 32}
                    onChange={(e) => sc.updateConfig(sel.id, { w: Number(e.target.value) })} />
                  <input type="number" min="1" max={rows} value={sel.config.h || 32}
                    onChange={(e) => sc.updateConfig(sel.id, { h: Number(e.target.value) })} />
                </div>
              </div>
              <div className="control">
                <label>Style</label>
                <select value={sel.config.disc ? "disc" : "square"}
                  onChange={(e) => sc.updateConfig(sel.id, { disc: e.target.value === "disc" })}>
                  <option value="square">Static square</option>
                  <option value="disc">Spinning disc</option>
                </select>
              </div>
              {!sel.config.disc && (
                <div className="control">
                  <label>Art fit</label>
                  <select value={sel.config.fit || "cover"}
                    onChange={(e) => sc.updateConfig(sel.id, { fit: e.target.value })}>
                    <option value="cover">Cover (fill, crop)</option>
                    <option value="contain">Contain (letterbox)</option>
                    <option value="center">Native (1:1)</option>
                    <option value="integer">Integer zoom (crisp)</option>
                    <option value="stretch">Stretch</option>
                  </select>
                </div>
              )}
            </>
          )}

          {sel.type === "nowplaying" && (
            <label className="checkbox">
              <input type="checkbox" checked={sel.config.show_artist !== false}
                onChange={(e) => sc.updateConfig(sel.id, { show_artist: e.target.checked })} />
              Show artist (2nd line)
            </label>
          )}

          {sel.type === "sprite" && (() => {
            const sp = (sprites || []).find((s) => s.id === sel.config.sprite_id) || null;
            const bubble = { ...SPRITE_BUBBLE_DEFAULTS, ...(sel.config.bubble || {}) };
            const presence = { ...SPRITE_PRESENCE_DEFAULTS, ...(sel.config.presence || {}) };
            const scale = Math.max(1, sel.config.scale || 1);
            const setBubble = (p) => sc.updateConfig(sel.id, { bubble: { ...bubble, ...p } });
            const setPresence = (p) => sc.updateConfig(sel.id, { presence: { ...presence, ...p } });
            const clipNames = sp ? Object.keys(sp.clips || {}) : [];
            const wake = new Set(presence.wake_on || []);
            const toggleWake = (ev) => {
              const next = new Set(wake);
              next.has(ev) ? next.delete(ev) : next.add(ev);
              setPresence({ wake_on: [...next] });
            };
            const sizeFor = (s, spr) => ({ w: (spr?.box?.w || 16) * s, h: (spr?.box?.h || 16) * s });
            const setScale = (v) => {
              const s = Math.max(1, Math.min(16, Math.round(Number(v) || 1)));
              sc.updateConfig(sel.id, { scale: s, ...sizeFor(s, sp) });
            };
            const pickSprite = (id) => {
              const next = (sprites || []).find((s) => s.id === id) || null;
              sc.updateConfig(sel.id, { sprite_id: id || null, ...sizeFor(scale, next) });
            };
            const say = async () => {
              try {
                const r = await api.spriteSay({ text: sayText, widget_id: sel.id, duration: 5 });
                if (!r.sprites) throw new Error("save the scene first so the panel has this sprite");
                sc.toast("Sent to the panel");
              } catch (e) {
                sc.toast(`Couldn't send: ${e.message}`, true);
              }
            };
            return (
              <>
                <div className="control">
                  <label>Sprite sheet</label>
                  <select value={sel.config.sprite_id || ""} onChange={(e) => pickSprite(e.target.value)}>
                    <option value="">— pick —</option>
                    {(sprites || []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.box?.w}×{s.box?.h})</option>
                    ))}
                  </select>
                  {!sprites?.length && (
                    <p className="field-hint">
                      No sprites yet — make one in the{" "}
                      <button className="linklike" onClick={() => onOpenStudio && onOpenStudio(null)}>Sprite Studio</button>.
                    </p>
                  )}
                </div>
                <div className="control">
                  <label>
                    Scale <span className="val">×{scale} · {sizeFor(scale, sp).w}×{sizeFor(scale, sp).h}px</span>
                  </label>
                  <div className="row2">
                    <input type="number" min="1" max="16" value={scale} onChange={(e) => setScale(e.target.value)} />
                    <label className="checkbox inline">
                      <input type="checkbox" checked={Boolean(sel.config.flip)}
                        onChange={(e) => sc.updateConfig(sel.id, { flip: e.target.checked })} />
                      Flip
                    </label>
                  </div>
                </div>
                {sp && (
                  <div className="control">
                    <label>Animations &amp; triggers</label>
                    <ul className="trigger-summary">
                      <li><span className="muted">idle</span> → {sp.idle_clip || "idle"}</li>
                      {(sp.triggers || []).map((t) => (
                        <li key={t.id}>
                          <span className="muted">{EVENT_SHORT[t.event] || t.event}</span> → {t.clip || <em className="muted">fallback</em>}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => onOpenStudio && onOpenStudio(sp.id)}>
                      <Icon name="edit" size={14} /> Edit in Sprite Studio
                    </button>
                  </div>
                )}

                <h4 className="sub">Speech bubble</h4>
                <label className="checkbox">
                  <input type="checkbox" checked={bubble.enabled !== false}
                    onChange={(e) => setBubble({ enabled: e.target.checked })} />
                  Show a speech bubble
                </label>
                {bubble.enabled !== false && (
                  <>
                    <label className="checkbox">
                      <input type="checkbox" checked={bubble.notifications !== false}
                        onChange={(e) => setBubble({ notifications: e.target.checked })} />
                      Present notifications (replaces the banner)
                    </label>
                    <label className="checkbox">
                      <input type="checkbox" checked={bubble.track !== false}
                        onChange={(e) => setBubble({ track: e.target.checked })} />
                      Announce new tracks
                    </label>
                    <div className="control">
                      <label>Placement / style / announce secs</label>
                      <div className="row3">
                        <select
                          value={bubble.side || "auto"}
                          onChange={(e) => {
                            const side = e.target.value;
                            if (side === "custom" && !bubble.box) {
                              const sw = sel.config.w || 16;
                              const room = cols - (sel.x + sw + 3);
                              const box = room >= 20
                                ? { dx: sw + 3, dy: -6, w: Math.min(44, room), h: 20 }
                                : { dx: 0, dy: -24, w: Math.min(48, cols - sel.x), h: 20 };
                              setBubble({ side, box });
                            } else {
                              setBubble({ side });
                            }
                          }}
                        >
                          <option value="auto">Auto</option>
                          <option value="right">Right</option>
                          <option value="left">Left</option>
                          <option value="above">Above</option>
                          <option value="below">Below</option>
                          <option value="custom">Custom box (drag on canvas)</option>
                        </select>
                        <select value={bubble.style || "light"} onChange={(e) => setBubble({ style: e.target.value })}>
                          <option value="light">Light</option>
                          <option value="dark">Dark</option>
                        </select>
                        <input type="number" min="1" max="60" value={bubble.track_seconds ?? 6}
                          onChange={(e) => setBubble({ track_seconds: Number(e.target.value) || 6 })} />
                      </div>
                    </div>
                    {bubble.side === "custom" && (
                      <div className="control">
                        <label>Bubble box · offset (dx, dy) · size (w, h)</label>
                        <div className="row4">
                          <NumInput min={-256} max={256} value={bubble.box?.dx ?? 0} onChange={(n) => setBubble({ box: { ...(bubble.box || {}), dx: n } })} aria-label="bubble dx" />
                          <NumInput min={-256} max={256} value={bubble.box?.dy ?? 0} onChange={(n) => setBubble({ box: { ...(bubble.box || {}), dy: n } })} aria-label="bubble dy" />
                          <NumInput min={6} max={512} value={bubble.box?.w ?? 24} onChange={(n) => setBubble({ box: { ...(bubble.box || {}), w: n } })} aria-label="bubble width" />
                          <NumInput min={6} max={512} value={bubble.box?.h ?? 12} onChange={(n) => setBubble({ box: { ...(bubble.box || {}), h: n } })} aria-label="bubble height" />
                        </div>
                        <p className="field-hint">Relative to the sprite, so it follows when you move the sprite. Drag the dashed box on the canvas, corners resize.</p>
                      </div>
                    )}
                    <div className="control">
                      <label>Corner radius · tail edge</label>
                      <div className="row2">
                        <NumInput min={0} max={12} value={bubble.radius ?? 2} onChange={(n) => setBubble({ radius: n })} aria-label="corner radius" />
                        <select value={bubble.tail || "auto"} onChange={(e) => setBubble({ tail: e.target.value })} aria-label="tail edge">
                          <option value="auto">Auto (faces the sprite)</option>
                          <option value="left">Left edge</option>
                          <option value="right">Right edge</option>
                          <option value="top">Top edge</option>
                          <option value="bottom">Bottom edge</option>
                          <option value="none">No tail</option>
                        </select>
                      </div>
                    </div>
                    {bubble.tail !== "none" && (
                      <div className="control">
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={bubble.tail_at === null || bubble.tail_at === undefined}
                            onChange={(e) => setBubble({ tail_at: e.target.checked ? null : 0.5 })}
                          />
                          Aim the tail at the sprite
                        </label>
                        {bubble.tail_at !== null && bubble.tail_at !== undefined && (
                          <>
                            <label>
                              Tail position along the edge <span className="val">{Math.round(bubble.tail_at * 100)}%</span>
                            </label>
                            <RangeInput
                              min={0}
                              max={100}
                              step="1"
                              value={Math.round(bubble.tail_at * 100)}
                              onChange={(e) => setBubble({ tail_at: Number(e.target.value) / 100 })}
                            />
                          </>
                        )}
                      </div>
                    )}
                    <div className="control">
                      <label>Typing speed (chars/s) · hold after (s)</label>
                      <div className="row2">
                        <NumInput min={2} max={120} value={bubble.cps ?? 18} onChange={(n) => setBubble({ cps: n })} aria-label="typing speed" />
                        <NumInput min={0} max={30} step="0.5" value={bubble.hold ?? 1.5} onChange={(n) => setBubble({ hold: n })} aria-label="hold seconds" />
                      </div>
                      <p className="field-hint">Text types out like a dialog box; the talking animation plays only while typing. When the box fills, lines crawl up.</p>
                    </div>
                    <div className="control">
                      <label>Preview text (editor only)</label>
                      <input type="text" value={bubble.sample ?? ""} onChange={(e) => setBubble({ sample: e.target.value })} />
                    </div>
                  </>
                )}

                <h4 className="sub">Presence</h4>
                <div className="control">
                  <label>On the panel</label>
                  <select value={presence.mode || "always"} onChange={(e) => setPresence({ mode: e.target.value })}>
                    <option value="always">Always on screen</option>
                    <option value="on_events">Leave when idle, come back for events</option>
                  </select>
                </div>
                {presence.mode === "on_events" && (
                  <>
                    <div className="control">
                      <label>Leave after (s) · exit direction</label>
                      <div className="row2">
                        <NumInput min={0} max={3600} value={presence.idle_seconds ?? 10} onChange={(n) => setPresence({ idle_seconds: n })} aria-label="idle seconds" />
                        <select value={presence.direction || "left"} onChange={(e) => setPresence({ direction: e.target.value })} aria-label="exit direction">
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                          <option value="up">Up</option>
                          <option value="down">Down</option>
                        </select>
                      </div>
                    </div>
                    <div className="control">
                      <label>Leaving animation · travel time (s)</label>
                      <div className="row2">
                        <select value={presence.exit_clip || ""} onChange={(e) => setPresence({ exit_clip: e.target.value })} aria-label="exit animation">
                          <option value="">— keep current —</option>
                          {clipNames.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <NumInput min={0.1} max={30} step="0.1" value={presence.exit_seconds ?? 1} onChange={(n) => setPresence({ exit_seconds: n })} aria-label="exit seconds" />
                      </div>
                    </div>
                    <div className="control">
                      <label>Returning animation · travel time (s)</label>
                      <div className="row2">
                        <select value={presence.enter_clip || ""} onChange={(e) => setPresence({ enter_clip: e.target.value })} aria-label="enter animation">
                          <option value="">— keep current —</option>
                          {clipNames.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <NumInput min={0.1} max={30} step="0.1" value={presence.enter_seconds ?? 1} onChange={(n) => setPresence({ enter_seconds: n })} aria-label="enter seconds" />
                      </div>
                    </div>
                    <div className="control">
                      <label>Comes back (and stays) for</label>
                      {[["say", "Told to say something"], ["notification", "Notifications"], ["track", "New track"], ["music", "Music playing"], ["value", "Value threshold"], ["time", "Time of day"]].map(([ev, label]) => (
                        <label key={ev} className="checkbox">
                          <input type="checkbox" checked={wake.has(ev)} onChange={() => toggleWake(ev)} /> {label}
                        </label>
                      ))}
                      <p className="field-hint">It returns from the same direction it left, waits until it's fully in, then the bubble types. Anything still active keeps it on screen.</p>
                    </div>
                  </>
                )}

                <h4 className="sub">Try it on the panel</h4>
                <div className="control">
                  <div className="row2">
                    <input type="text" value={sayText} onChange={(e) => setSayText(e.target.value)}
                      placeholder="Say something…" />
                    <button onClick={say} disabled={!sp || !sayText.trim()}>Say it</button>
                  </div>
                  <p className="field-hint">
                    Plays the talking clip with this text for 5 s on the live panel (scene must be showing).
                    Any service can do the same: <code>POST /api/sprite/say</code>.
                  </p>
                </div>
              </>
            );
          })()}

          <div className="control">
            <label>Position (x, y)</label>
            <div className="row2">
              <input
                type="number"
                min="0"
                max={cols - 1}
                value={sel.x}
                onChange={(e) => sc.updateWidget(sel.id, { x: Number(e.target.value) })}
              />
              <input
                type="number"
                min="0"
                max={rows - 1}
                value={sel.y}
                onChange={(e) => sc.updateWidget(sel.id, { y: Number(e.target.value) })}
              />
            </div>
          </div>
          {sel.type !== "image" && sel.type !== "music" && sel.type !== "sprite" && (
            <>
              <div className="control">
                <label>Text box (w × h)</label>
                <div className="row2">
                  <input type="number" min="6" max={cols} value={sel.config?.w || 60}
                    onChange={(e) => sc.updateConfig(sel.id, { w: Number(e.target.value) })} />
                  <input type="number" min="6" max={rows} value={sel.config?.h || 12}
                    onChange={(e) => sc.updateConfig(sel.id, { h: Number(e.target.value) })} />
                </div>
                <p className="field-hint">Resize the box to wrap/clip; font size is separate.</p>
              </div>
              {fontList.length > 1 && (
                <div className="control">
                  <label>Font</label>
                  <select
                    value={sel.config?.font || "5x7"}
                    onChange={(e) => {
                      const fh = (fontList.find((f) => f.name === e.target.value) || {}).height || 7;
                      const scale = Math.max(1, Math.round((sel.size || fh) / selFontH));
                      // keep the same visual scale when switching fonts
                      sc.updateConfig(sel.id, { font: e.target.value });
                      sc.updateWidget(sel.id, { size: scale * fh });
                    }}
                  >
                    {fontList.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name} ({f.height}px)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="control">
                <label>
                  Font size / color / align{" "}
                  <span className="val">×{Math.max(1, Math.round((sel.size || selFontH) / selFontH))}</span>
                </label>
                <div className="row3">
                  <input
                    type="number"
                    min={selFontH}
                    max={selFontH * 8}
                    step={selFontH}
                    value={sel.size}
                    onChange={(e) => {
                      const scale = Math.max(1, Math.round(Number(e.target.value) / selFontH));
                      sc.updateWidget(sel.id, { size: scale * selFontH });
                    }}
                  />
                  <input
                    type="color"
                    value={sel.color}
                    onChange={(e) => sc.updateWidget(sel.id, { color: e.target.value })}
                  />
                  <select
                    value={sel.align}
                    onChange={(e) => sc.updateWidget(sel.id, { align: e.target.value })}
                  >
                    <option value="left">L</option>
                    <option value="center">C</option>
                    <option value="right">R</option>
                  </select>
                </div>
              </div>
            </>
          )}
          <button className="danger" onClick={() => sc.removeWidget(sel.id)}>Remove {sel.type}</button>
        </div>
      )}

      <div className="settings-section">
        <h4>Weather location</h4>
        <p className="field-hint">Free (Open-Meteo, no key). Enter your lat/lon.</p>
        <div className="control">
          <div className="row3">
            <input
              type="number"
              step="0.0001"
              placeholder="lat"
              value={weather.lat}
              onChange={(e) => setWeather((w) => ({ ...w, lat: e.target.value }))}
            />
            <input
              type="number"
              step="0.0001"
              placeholder="lon"
              value={weather.lon}
              onChange={(e) => setWeather((w) => ({ ...w, lon: e.target.value }))}
            />
            <select
              value={weather.unit}
              onChange={(e) => setWeather((w) => ({ ...w, unit: e.target.value }))}
            >
              <option value="fahrenheit">°F</option>
              <option value="celsius">°C</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h4>Saved scenes</h4>
        <div className="control">
          <div className="row2">
            <input
              type="text"
              placeholder="name"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
            />
            <button
              className="primary"
              disabled={!sceneName.trim()}
              onClick={() => {
                sc.saveAs(sceneName.trim());
                setSceneName("");
              }}
            >
              Save as…
            </button>
          </div>
        </div>
        {sc.saved.length === 0 && <p className="field-hint">No saved scenes yet.</p>}
        {sc.saved.map((name) => (
          <div className="saved-row" key={name}>
            <button
              className="linklike"
              onClick={() => {
                if (
                  !sc.dirty ||
                  window.confirm(`Load "${name}" and discard your unsaved changes?`)
                )
                  sc.loadNamed(name);
              }}
            >
              {name}
            </button>
            <button
              className="tiny-x"
              title={`Delete saved scene "${name}"`}
              aria-label={`Delete saved scene ${name}`}
              onClick={() => {
                if (window.confirm(`Delete saved scene "${name}"? This can't be undone.`))
                  sc.deleteNamed(name);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>

    {cropWidget && (() => {
      const item = (media || []).find((m) => m.id === cropWidget.config.media_id);
      if (!item) return null;
      return (
        <CropModal
          item={item}
          config={cropWidget.config}
          onApply={(patch) => sc.updateConfig(cropWidget.id, patch)}
          onClose={() => setCropWidget(null)}
        />
      );
    })()}
    </>
  );
}

function Slider({ label, value, min = 0.1, max = 3, onChange }) {
  return (
    <div className="control">
      <label>
        {label} <span className="val">{Number(value).toFixed(2)}×</span>
      </label>
      <RangeInput
        min={min}
        max={max}
        step="0.05"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
