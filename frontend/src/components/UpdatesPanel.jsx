import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";

// Check for and apply updates from the web UI. Updating the backend restarts it,
// so after triggering we poll until the version changes, then reload.
export default function UpdatesPanel({ onToast }) {
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | updating | done | error

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setInfo(await api.checkUpdate());
    } catch (e) {
      onToast(`Update check failed: ${e.message}`, true);
    } finally {
      setChecking(false);
    }
  }, [onToast]);

  useEffect(() => {
    check();
  }, [check]);

  const runUpdate = async () => {
    const old = info?.version;
    setPhase("updating");
    try {
      await api.runUpdate();
    } catch (e) {
      setPhase("error");
      onToast(`Update failed: ${e.message}`, true);
      return;
    }
    // The backend may restart mid-update — poll (ignoring errors) until the
    // reported version changes, then reload to pick up any new UI.
    const start = Date.now();
    const poll = async () => {
      if (Date.now() - start > 120000) {
        setPhase("done");
        return;
      }
      try {
        const r = await api.checkUpdate();
        if (r.version && r.version !== old) {
          setPhase("done");
          setTimeout(() => location.reload(), 1500);
          return;
        }
      } catch {
        /* backend restarting */
      }
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 4000);
  };

  return (
    <div className="settings-section">
      <h3>Updates</h3>

      {!info && checking && <p className="muted">Checking…</p>}

      {info && (
        <>
          <p className="muted small">
            Running <b>{info.version}</b>
            {info.branch ? ` (${info.branch})` : ""}
            {info.message ? ` — ${info.message}` : ""}
          </p>

          {info.error && <p className="err small">⚠ {info.error}</p>}
          {info.git === false && (
            <p className="field-hint">Not a git install — update manually.</p>
          )}

          {info.git && !info.error && info.available && (
            <>
              <p className="update-avail">
                ⬆ {info.behind} update{info.behind === 1 ? "" : "s"} available:
              </p>
              <ul className="update-changes">
                {(info.changes || []).slice(0, 10).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
          {info.git && !info.error && !info.available && phase === "idle" && (
            <p className="muted small">✓ Up to date.</p>
          )}

          <div className="actions">
            {info.git && info.available && phase !== "updating" && (
              <button className="primary" onClick={runUpdate}>
                Update now
              </button>
            )}
            <button onClick={check} disabled={checking || phase === "updating"}>
              {checking ? "Checking…" : "Check again"}
            </button>
          </div>

          {phase === "updating" && (
            <p className="muted small">Updating… the panel keeps running; reconnecting…</p>
          )}
          {phase === "done" && <p className="muted small">✓ Updated — reloading…</p>}
        </>
      )}

      <p className="field-hint">
        This button updates the <b>Pi</b> (backend, and the UI when it's served from the Pi). If your
        frontend runs elsewhere (a Docker container on a NAS), run <code>bash deploy/update.sh</code>
        on that host — the same script detects Docker and rebuilds the container for you (or set up
        the auto-update cron, see docs/DEPLOYMENT.md).
      </p>
    </div>
  );
}
