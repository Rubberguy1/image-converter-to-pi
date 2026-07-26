import React, { useEffect, useState } from "react";
import { backendBase, setBackendBase, savedDevices, forgetDevice } from "../backend.js";
import { discover, guessSubnet, canSweep } from "../discover.js";

// The only way into the app when it isn't served by the Pi. Everything here is
// user-driven and browser-local: pick a remembered Pi, search the network for
// one, or type its address. Nothing is stored server-side; the app never
// connects to anything the user didn't choose.
export default function ConnectScreen({ error, onConnect }) {
  const [url, setUrl] = useState(backendBase());
  const [devices, setDevices] = useState(savedDevices());
  const [subnet, setSubnet] = useState("");
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState([]);

  useEffect(() => {
    if (canSweep()) guessSubnet().then((s) => s && setSubnet((cur) => cur || s));
  }, []);

  const connectTo = (u) => {
    setBackendBase(u);
    onConnect();
  };

  const scan = async () => {
    setScanning(true);
    setFound([]);
    try {
      await discover({ subnet: canSweep() ? subnet : "", onFound: setFound });
    } finally {
      setScanning(false);
    }
  };

  // Still trying same-origin and nothing has failed yet.
  if (!error) {
    return (
      <div className="app loading">
        <h1>
          Pixel<span>Pusher</span>
        </h1>
        <p className="muted">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="app loading">
      <h1>
        Pixel<span>Pusher</span>
      </h1>

      <div className="connect-card">
        <p className="muted small">Connect to your Pi to get started. This stays in your browser only.</p>

        {devices.length > 0 && (
          <div className="connect-group">
            <label>Your devices</label>
            {devices.map((d) => (
              <div className="device-row" key={d.url}>
                <button className="linklike" onClick={() => connectTo(d.url)} title={d.url}>
                  <b>{d.name}</b> <span className="muted small">{d.url}</span>
                </button>
                <button
                  className="tiny-x"
                  title="Forget"
                  onClick={() => {
                    forgetDevice(d.url);
                    setDevices(savedDevices());
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="connect-group">
          <label>Find on the network</label>
          {canSweep() && (
            <div className="row2">
              <input
                type="text"
                placeholder="subnet e.g. 192.168.1"
                value={subnet}
                onChange={(e) => setSubnet(e.target.value)}
              />
              <button onClick={scan} disabled={scanning}>
                {scanning ? "Scanning…" : "🔍 Search"}
              </button>
            </div>
          )}
          {!canSweep() && (
            <button onClick={scan} disabled={scanning}>
              {scanning ? "Scanning…" : "🔍 Search by name"}
            </button>
          )}
          {!canSweep() && (
            <p className="field-hint">
              A network sweep only works when the app is served locally (HTTP). Over HTTPS it can
              only find a Pi by hostname.
            </p>
          )}
          {found.map((d) => (
            <div className="device-row found" key={d.url}>
              <button className="linklike" onClick={() => connectTo(d.url)} title={d.url}>
                <b>{d.name}</b> <span className="muted small">{d.url} · {d.detail}</span>
              </button>
            </div>
          ))}
          {scanning && found.length === 0 && <p className="muted small">Looking for Pixel Pusher devices…</p>}
        </div>

        <form
          className="connect-group"
          onSubmit={(e) => {
            e.preventDefault();
            connectTo(url);
          }}
        >
          <label>Or enter the address</label>
          <div className="row2">
            <input
              type="text"
              placeholder="http://raspberrypi.local:8000"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button className="primary" type="submit">
              Connect
            </button>
          </div>
        </form>

        <p className="err small">⚠ {error ? error : "Couldn't reach the backend."}</p>
      </div>
    </div>
  );
}
