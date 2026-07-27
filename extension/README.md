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

### Firefox (temporary — for quick testing)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `build/firefox/manifest.json`.
3. Firefox may ask you to grant the "access your data for all websites"
   permission — that's the host access it needs to read media metadata and reach
   the Pi. Allow it (click the extension's puzzle-piece → permissions if it isn't
   granted automatically).

**Temporary add-ons are removed every time Firefox restarts.** To install it
permanently, sign it (below).

### Firefox (permanent — signed)

Regular Firefox only keeps **signed** extensions across restarts. Mozilla will
sign your own private copy for free without listing it publicly:

1. Create a free add-on account + API credentials:
   <https://addons.mozilla.org/en-US/developers/addon/api/key/>
2. Install the tool: `npm install --global web-ext`
3. Provide your credentials and sign:
   ```powershell
   $env:WEB_EXT_API_KEY    = "user:XXXXXXX:123"
   $env:WEB_EXT_API_SECRET = "your-long-secret"
   ./build.ps1
   ./sign-firefox.ps1        # or: web-ext sign --source-dir build/firefox --channel unlisted
   ```
4. The signed `.xpi` appears in `build/firefox-signed/`. Open it in Firefox
   (drag it onto `about:addons`, or File → Open) to install it permanently.

The extension already declares the add-on ID (`browser_specific_settings.gecko.id`)
that signing requires, so no manifest changes are needed.

> Alternative without an account: **Firefox Developer Edition, Nightly, or ESR**
> let you set `xpinstall.signatures.required = false` in `about:config` and then
> install the unsigned `.xpi` from `web-ext build` permanently. Regular
> release/Beta Firefox ignore that pref and require signing.

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
