# Pixel Pusher — "Now Playing" browser extension

Sends whatever is playing in your browser — a YouTube video, YouTube Music, a
Spotify web tab, SoundCloud, almost anything that shows up in your OS media
controls — to your Pixel Pusher LED panel, so the panel shows the album/thumbnail
art and title.

It works by reading the [Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
that sites populate for the on-screen media controls. **No Last.fm, no API key, no
account, no cloud.** The extension runs on *your* computer and POSTs directly to
the Pi over your local network, so:

- The machine running the extension does **not** need to host the frontend or
  backend — it just needs to reach the Pi's address.
- You can run the extension on a laptop while the Pi (and even the web UI) live
  elsewhere.

## Build

Each browser wants its manifest named `manifest.json`, so a tiny build step
copies the shared files plus the right manifest into `build/chromium` and
`build/firefox`.

```powershell
# Windows (PowerShell), from the extension/ folder:
./build.ps1
```

```bash
# macOS / Linux:
bash build.sh
```

## Install

### Chrome / Edge / Brave / Opera / Arc (Chromium)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `build/chromium` folder.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `build/firefox/manifest.json`.
   - Temporary add-ons are removed when Firefox restarts. To keep it permanently
     you'd sign it via [AMO](https://addons.mozilla.org/developers/), but for
     personal use just re-load it after a restart.
3. Firefox may ask you to grant the "access your data for all websites"
   permission — that's the host access it needs to read media metadata and reach
   the Pi. Allow it (click the extension's puzzle-piece → permissions if it isn't
   granted automatically).

## Configure

1. Open the extension's **options** (Chromium: right-click the icon → Options;
   Firefox: `about:addons` → the extension → Preferences; or click the toolbar
   icon → **Settings…**).
2. Enter your Pi's address — the same URL you open the web app at, e.g.
   `http://192.168.1.50:8000` or `http://raspberrypi.local:8000`.
3. Click **Test connection** — it should say "Connected to …".
4. Make sure **Enabled** is checked and **Save**.

Then in the Pixel Pusher web app: **Music sync → Source → Browser → Start
syncing**. Play something in any tab and the panel follows it.

## How it decides what to show

- Every tab reports its current Media Session state every few seconds.
- The background worker picks the tab that is *actually playing* (most recent
  wins if several play at once), fetches its artwork, and sends it to the Pi.
- When you pause everything, it tells the Pi playback stopped and the panel
  clears. If the browser closes without a final update, the Pi clears the panel
  on its own after ~45s.

## Limitations

- You install it per browser (same as any scrobbler) — that's the unavoidable
  "watch playback where it happens" cost.
- A few sites don't fill in Media Session metadata; for those you may get just
  the tab title, or nothing. Plain YouTube and YouTube Music work well.
- Pages with a very strict Content-Security-Policy can block the in-page reader;
  those tabs simply won't report.

## Privacy

The extension only ever contacts the one Pi address you enter. It stores that
address (and the enabled flag) in the browser's local extension storage. It does
not send anything anywhere else.
