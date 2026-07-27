# Serving Pixel Pusher over HTTPS

You only need this if you use the **browser extension from Firefox**. Firefox
runs the extension in a secure context and refuses to let it fetch a plain
`http://` LAN address, so the Pi has to speak `https://` with a certificate the
browser **trusts**. (Chromium/Edge don't have this restriction — if you only use
those, you can skip all of this and keep plain HTTP.)

The tricky part isn't the server — it's making the certificate *trusted*. A bare
self-signed cert you "click through" in a tab may not satisfy the extension's
background fetch, which can't show a warning. Two ways to get a trusted cert:

- **mkcert (recommended)** — a locally-trusted cert, no browser warnings, works
  offline. One-time tool install per computer.
- **Self-signed + a stored Firefox exception** — no extra tools, but you must add
  a permanent exception, and it's not guaranteed to apply to the extension.

Both end the same way: the backend serves TLS on port `8000`, and you point the
extension and web app at `https://<pi>:8000`.

---

## How the server side works

`python -m app` (the systemd `ExecStart`) serves HTTPS automatically when
`TLS_CERTFILE` and `TLS_KEYFILE` are set in `backend/.env`, otherwise plain HTTP.
`deploy/enable-https.sh` wires that up for you.

---

## Option A — mkcert (recommended)

mkcert creates a little certificate authority (CA), installs it into your OS and
Firefox trust stores, and issues certs signed by it — so there are no warnings
anywhere.

**On the computer that runs the extension** (your PC):

1. Install mkcert: <https://github.com/FiloSottile/mkcert#installation>
   (Windows: `choco install mkcert` or `scoop install mkcert`.)
2. Install its CA into your trust stores (this is what makes it trusted):
   ```
   mkcert -install
   ```
   On Windows this also needs Firefox's `certutil`; mkcert will tell you if it's
   missing. If Firefox still doesn't trust it, set
   `security.enterprise_roots.enabled = true` in `about:config`.
3. Issue a cert for the Pi (use its **static IP** and hostnames):
   ```
   mkcert 192.168.1.152 raspberrypi.local raspberrypi
   ```
   This writes two files, e.g. `192.168.1.152+2.pem` (cert) and
   `192.168.1.152+2-key.pem` (key).
4. Copy both to the Pi:
   ```
   scp 192.168.1.152+2.pem 192.168.1.152+2-key.pem  <you>@192.168.1.152:~
   ```

**On the Pi:**

```
cd ~/pixel-pusher
sudo bash deploy/enable-https.sh ~/192.168.1.152+2.pem ~/192.168.1.152+2-key.pem
```

That's it — no browser warnings. Repeat step 2 (`mkcert -install`, after copying
the CA from `mkcert -CAROOT`) on any other computer that runs the extension.

> Give the Pi a **DHCP reservation** so its IP doesn't change — the cert is tied
> to the address/hostnames you listed.

---

## Option B — self-signed (no extra tools)

**On the Pi:**

```
cd ~/pixel-pusher
sudo bash deploy/enable-https.sh
```

This generates a self-signed cert (covering the Pi's hostname and current IP),
enables TLS, and restarts.

**Then trust it in Firefox:**

1. Visit `https://<pi-ip>:8000` in a normal Firefox tab.
2. You'll get "Warning: Potential Security Risk" → **Advanced…** →
   **Accept the Risk and Continue**. This stores a permanent exception for that
   host in your Firefox profile.
3. Reload the extension and try again.

If the extension still fails after adding the exception, Firefox isn't applying
the stored override to the extension's background request — switch to Option A
(mkcert), which trusts the cert fully and always works.

---

## Point the extension + web app at HTTPS

Once TLS is on, **everything** on the Pi is HTTPS (UI, API, and the screen-mirror
WebSocket, which becomes `wss://` automatically):

- **Extension:** open its options and change the address to
  `https://192.168.1.152:8000` (note the `s`). Test connection.
- **Web app:** open `https://192.168.1.152:8000` and re-save the device if you
  use the connect screen. Update any bookmarks.
- **Chromium build:** it works over HTTP already, but it's fine to point it at
  the HTTPS URL too so everything matches.

---

## Reverting to plain HTTP

Remove the two lines from `backend/.env`:

```
TLS_CERTFILE=...
TLS_KEYFILE=...
```

then `sudo systemctl restart pixel-pusher`. It's back on `http://<pi>:8000`.

---

## Troubleshooting

- **`journalctl -u pixel-pusher -n 20`** — on start it logs either
  `Serving HTTPS on :8000` or, if the cert paths are wrong,
  `TLS configured but files missing … serving HTTP`.
- **Extension shows NetworkError over HTTPS** — the cert isn't trusted by this
  browser. Redo the trust step (Option A step 2, or Option B step 2).
- **Works in a tab but not the extension (Firefox)** — that's the self-signed
  exception not covering the extension; use mkcert.
- **Cert stopped working** — the Pi's IP probably changed. Reserve its IP and
  reissue the cert for the new address.
