# Music mode

Music mode is a **per-scene** setting. A scene shows as designed; the moment a
track starts playing (from whichever Music source is on), the panel crossfades
into a fullscreen music view, and fades back when playback stops.

```
 scene (clock, sprite, …)  ──crossfade──▶  album art, cropped to fill the panel
                                            + waveform bars (optional)
                           ◀──crossfade──   + title / artist band (scrolls if long)
```

## Turning it on

- Header ▸ **Music mode** button (desktop), the Music mode card on mobile Home,
  or the checkbox at the top of the scene controls. This is saved with the scene
  immediately, like *Show on panel*.
- The other options live in the scene controls' **Music mode** section and save
  with the scene (Save / Save as):

| Option | Meaning |
|---|---|
| Art style | **Cover**: the art fills the panel, cropped to the panel's aspect (multi-panel walls too). **Spinning disc**: the disc renderer at panel size. **Visualizer**: no art — a slow diagonal gradient in two colours pulled from the album art (its most vivid colour and its average), breathing with the overall level and rippling per band. `viz` picks the flavour; only `gradient` exists so far. |
| Transition | Crossfade in/out, seconds. |
| Show track title & artist | A translucent band at the bottom; text scrolls when it doesn't fit. |
| Waveform | **Off**, **Live audio, else synthesized** (bars follow real levels when a browser is sending them, otherwise a gentle fake spectrum), or **Live audio only**. Colour and height are adjustable. |
| Dim art | Darkens the art so the bars and text read better. |
| Preview music mode in the editor | Renders the music view in the editor even with nothing playing, so you can tune it. |

The mode needs a Music source (header ▸ Music) so the backend knows what is
playing and has the album art. Any source works: Browser extension, Last.fm,
Plex, VLC.

## Waveform: where the audio comes from

The Pi hears nothing, so a **browser** captures the audio and streams a few
frequency bands to the backend several times a second:

- Header ▸ Music ▸ **Send audio levels for the waveform**. Pick *Shared tab /
  screen audio* (Chromium: tick "Share audio" in the picker) or *Microphone*.
- Needs HTTPS or localhost (the browser's capture rule, same as the screen
  mirror). Otherwise, or when nothing is being sent, the waveform is synthesized.
- Any other program can feed levels too: `POST /api/music/levels` with
  `{"bands": [0..1, …]}` (up to 64 bands). Levels older than 1.5 s expire.

## Where it lives

- `backend/app/scene/model.py` — `default_music()` and `Scene.music`.
- `backend/app/scene/runner.py` — `_apply_music_mode()` (the blend, stepped per
  tick toward 1 while a track's art is ready and 0 otherwise), `_music_view()`
  (art / dim / waveform / title), `_draw_waveform()`, `_draw_marquee()`.
- `backend/app/music/levels.py` — the live-level store + `synth_levels()`.
- `frontend/src/components/AudioLevels.jsx` — browser audio capture → bands.
- `frontend/src/hooks/useScene.js` — `MUSIC_MODE_DEFAULTS`, `updateMusic`,
  `setMusicMode`, `musicPreview`.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/music-mode` `{enabled}` | Toggle the active scene's music mode (persisted) |
| POST | `/api/music/levels` `{bands: [...]}` | Live audio levels for the waveform |
| POST | `/api/scene/preview?music=1` | Render the music view of a (possibly unsaved) scene |
