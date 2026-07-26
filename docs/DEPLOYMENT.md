# Deployment: where the frontend runs

Pixel Pusher is a **FastAPI backend** (must run on the Pi — it drives the matrix
GPIO) plus a **static React frontend** (runs in your browser). You choose where
the frontend is *served* from. All features work identically either way.

```
             Mode A — all on the Pi                Mode B — split
   ┌──────────── Raspberry Pi ────────────┐   ┌── Raspberry Pi ──┐
   │  backend (API + GPIO)                 │   │  backend (API)   │
   │  └ serves the built frontend  ────────┼─▶ │                  │◀── /api ──┐
   └───────────────────────────────────────┘   └──────────────────┘           │
                    ▲ browser                          ▲ browser               │
                    │ http://raspberrypi.local:8000    │        ┌──────────────┴─────────┐
                                                       │        │ frontend (elsewhere):  │
                                                       └────────│ Docker / dev / hosted  │
                                                                └────────────────────────┘
```

The frontend is **origin-agnostic**: every request is either same-origin
(`/api/...`) or aimed at a backend URL you configure. So the same build works in
both modes.

---

## Mode A — everything on the Pi (simplest)

The Pi runs the backend *and* serves the UI. One device, one URL.

```bash
bash deploy/install-pi.sh
```

Open **http://raspberrypi.local:8000**. Done. (This is the default; see
[PI_SETUP.md](PI_SETUP.md).)

---

## Mode B — backend on the Pi, frontend elsewhere

Run the heavy UI off the Pi (a laptop, a home server, a NAS), talking to the
Pi's backend. Good if you want to iterate on the UI, run one UI against multiple
Pis, or keep the Pi lean.

### 1. On the Pi — backend only

```bash
bash deploy/install-pi.sh --backend-only
```

This installs and starts the backend service (API on port 8000) and **skips the
frontend build**. Confirm it's up: `curl http://raspberrypi.local:8000/api/status`.

### 2. Elsewhere — run the frontend. Pick one:

**A) Docker (recommended).** A container serves the UI and reverse-proxies
`/api` (and the screen-mirror WebSocket) to your Pi — so the browser only ever
talks to the container (same origin: **no CORS, no HTTPS/mixed-content issues**).

```bash
# from the repo root, set PI_HOST to your Pi's backend host:port
PI_HOST=192.168.1.199:8000 docker compose up -d --build
# → open http://localhost:8080
```

(Or without compose: `docker build -t pixel-pusher-frontend ./frontend` then
`docker run -p 8080:80 -e PI_HOST=192.168.1.199:8000 pixel-pusher-frontend`.)

**B) Vite dev server** (for developing the UI). It proxies `/api` to the Pi:

```bash
cd frontend
# macOS/Linux:
VITE_API_TARGET=http://raspberrypi.local:8000 npm run dev
# Windows PowerShell:
$env:VITE_API_TARGET="http://raspberrypi.local:8000"; npm run dev
```

**C) Any static host** (Netlify, an S3 bucket, `npm run build` + any web
server). Serve `frontend/dist`. On first load the app shows a **"Connect to your
Pi"** screen — enter `http://raspberrypi.local:8000` (or your Pi's IP:8000) and
it remembers it. To bake a fixed address into the build instead, set
`VITE_API_BASE=http://raspberrypi.local:8000` before `npm run build`.

Change or clear the backend later from the **🖧 chip** in the header.

---

## How the two frontend approaches differ

| | Reverse proxy (Docker option A / dev server) | Direct (static host, option C) |
|---|---|---|
| Browser talks to | the proxy (same origin) | the Pi directly (cross-origin) |
| CORS | not involved | backend already allows all origins |
| Screen mirror WS | proxied — just works | connects to the Pi directly |
| HTTPS / mixed content | not an issue | frontend-HTTPS + Pi-HTTP is blocked by browsers |

**Prefer the reverse-proxy (Docker) approach** unless you specifically need a
hosted static build — it sidesteps every cross-origin headache.

## Screen mirror needs a secure context

The screen-mirror capture (`getDisplayMedia`) only works over **HTTPS or
localhost**. So:
- Docker on your machine at `http://localhost:8080` → works (localhost).
- A hosted HTTP frontend → screen mirror is blocked. Serve the frontend over
  HTTPS (and either proxy to the Pi, or put the Pi behind HTTPS too). See the
  HTTPS section of [PI_SETUP.md](PI_SETUP.md).

## Converting an existing all-in-one install to backend-only

Already running Mode A and want to move the UI off the Pi? You don't reinstall —
you just stop the Pi from serving the frontend and run it elsewhere.

On the Pi:

```bash
cd ~/pixel-pusher
git pull                                   # get the latest (Docker/backend-only support)
# Stop serving the built UI from the Pi (optional but tidy — the backend then
# serves ONLY the API; "/" returns a small JSON status instead of the app):
rm -rf frontend/dist
sudo systemctl restart pixel-pusher
curl http://raspberrypi.local:8000/api/status   # confirm the API is up
```

That's it — the Pi is now backend-only. (Leaving `frontend/dist` in place is
harmless too; the Pi just keeps serving a copy of the UI you won't use.) From now
on, `deploy/update.sh` won't rebuild the frontend as long as there's no `dist`.

Then run the off-Pi frontend and point it at the Pi — the easiest is the Docker
container from **Mode B** above (`PI_HOST=<pi-ip>:8000 docker compose up -d
--build`), or a hosted build (next section).

To go **back** to all-in-one: `cd ~/pixel-pusher/frontend && npm run build &&
sudo systemctl restart pixel-pusher` (needs Node on the Pi — see PI_SETUP step 7).

---

## Hosting the frontend on the internet (reach your Pi from anywhere)

You can host the static frontend on a free HTTPS host (Netlify, Cloudflare Pages,
Vercel…) and use it from anywhere. **But two things make this different from the
LAN case:**

> ⚠️ **Security.** The backend has **no login**. Anyone who can reach it can
> control your panel, upload media, and read/change settings. **Never** just
> port-forward it to the open internet. Use a method that keeps it private or
> puts a login in front (below).
>
> 🔒 **Mixed content.** A hosted frontend is served over **HTTPS**, and browsers
> **block** an HTTPS page from calling a plain-`http://` backend. So your Pi
> backend must be reachable over **HTTPS** too. The two options below both give
> you that.

### Step 1 — expose the Pi backend over HTTPS (pick one)

**A) Tailscale (recommended — private, no port-forwarding).** Puts the Pi on a
private mesh VPN only your own devices can reach, and gives it an HTTPS URL.

```bash
# on the Pi
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# In the Tailscale admin console: DNS → enable HTTPS certificates. Then:
sudo tailscale serve --bg 8000
sudo tailscale serve status     # shows your URL, e.g. https://raspberrypi.tailXXXX.ts.net
```

Install Tailscale on the phone/laptop you'll browse from too (same account). Now
the Pi is reachable at that `https://…ts.net` URL **from anywhere your device is**,
and **only** your devices can reach it. This is the safest option.

**B) Cloudflare Tunnel + Access (public URL, gated by a login).** Gives the Pi a
public HTTPS URL and requires you to log in (email/SSO) before anything reaches
it. More setup — follow Cloudflare's "Tunnel" + "Access" guides, pointing the
tunnel at `http://localhost:8000` on the Pi. **Do add an Access policy** — a bare
tunnel is the internet exposure you want to avoid.

### Step 2 — host the frontend

Any static host works (the app is just files in `frontend/dist`). Git-connected
is easiest since your repo is already on GitHub:

- **Netlify:** New site → import your GitHub repo. Settings come from
  [`netlify.toml`](../netlify.toml) (base `frontend`, build `npm run build`,
  publish `dist`). Deploy → you get `https://<name>.netlify.app`.
- **Cloudflare Pages:** Create project → connect the repo → **Root directory:**
  `frontend`, **Build command:** `npm run build`, **Output:** `dist`.
- **Vercel:** import repo → **Root Directory:** `frontend` (framework: Vite).

Leave `VITE_API_BASE` unset so you can point at your Pi at runtime (next step). If
you'd rather bake it in, set `VITE_API_BASE=https://raspberrypi.tailXXXX.ts.net`
as a build environment variable.

### Step 3 — connect

Open your hosted URL. Because it can't find a backend at its own origin, it shows
the **"Connect to your Pi"** screen, which offers three ways in:

- **Search the network** — the app probes for a Pi (by `*.local` hostname always;
  a full subnet sweep when the app is served over **HTTP**, e.g. the Docker
  container or dev server). Found devices appear as one-click buttons. *(An HTTPS
  hosted page can only find a Pi by hostname — it can't sweep `http://` LAN
  addresses. For a hosted build, use the Step-1 HTTPS URL below.)*
- **Your devices** — Pis you've connected to before, remembered in this browser.
- **Enter the address** — paste the URL from Step 1
  (`https://raspberrypi.tailXXXX.ts.net`, your Cloudflare hostname, or
  `http://<pi-ip>:8000` on a local network).

Change or clear it anytime from the **🖧 chip** in the header.

### Credential-free & per-user by design

The frontend build ships with **no baked-in server, no credentials, nothing
shared**. Each person configures their own connection in their **own browser**;
it's stored only there (in `localStorage`), never server-side. The app never
talks to anything you didn't explicitly connect to. Two people opening the same
hosted URL are independent — each connects to their own Pi. If/when the backend
gains a login, those details live in the browser the same way.

> LAN-only alternative (no tunnel): give the Pi a self-signed cert (see the HTTPS
> section of [PI_SETUP.md](PI_SETUP.md)), visit `https://<pi-ip>:8000` once to
> accept the warning, then enter that URL on the connect screen. Works only on the
> same network and shows a cert warning — the Docker reverse-proxy (Mode B) is
> nicer for LAN use.

---

## Updating

- **Backend (Pi):** `bash deploy/update.sh` (works with `--backend-only` too — it
  just skips the frontend build if there's no `dist`).
- **Frontend (Docker):** `git pull` then `PI_HOST=... docker compose up -d --build`.
- **Frontend (hosted):** push to GitHub — Netlify/Pages/Vercel rebuild
  automatically.
