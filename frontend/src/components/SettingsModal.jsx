import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import PanelLayout from "./PanelLayout.jsx";

// Secret fields are write-only: the backend never returns their value, only a
// "<field>_set" flag. Leaving one blank keeps the existing value.
const TABS = [
  {
    id: "panel",
    label: "Panel",
    sections: [
      {
        title: "Layout",
        hint: "Arrange your panels. Total resolution and power update automatically.",
        fields: [
          { key: "matrix_panels_wide", label: "Panels wide", type: "number", min: 1, max: 16 },
          { key: "matrix_panels_tall", label: "Panels tall", type: "number", min: 1, max: 16 },
          { key: "matrix_panel_cols", label: "Panel width (px)", type: "number", min: 8, max: 128 },
          { key: "matrix_panel_rows", label: "Panel height (px)", type: "number", min: 8, max: 128 },
          {
            key: "matrix_orientation",
            label: "Orientation",
            type: "select",
            options: [
              { value: 0, label: "0° (normal)" },
              { value: 90, label: "90°" },
              { value: 180, label: "180° (upside down)" },
              { value: 270, label: "270°" },
            ],
            hint: "Single-panel rotation. For multi-panel walls use the per-panel layout below.",
          },
        ],
      },
      {
        title: "Wiring (multi-panel)",
        hint: "How the panels are cabled to the HAT. total = chain × parallel must equal your panel count. 0 = auto (single chain).",
        fields: [
          { key: "matrix_parallel", label: "Parallel outputs", type: "number", min: 0, max: 3,
            hint: "Separate output connectors on the HAT/bonnet used (1–3). 0 = auto (1)." },
          { key: "matrix_chain_length", label: "Chain length", type: "number", min: 0, max: 16,
            hint: "Panels daisy-chained per output. 0 = auto (panel count ÷ parallel)." },
        ],
      },
      {
        title: "Hardware tuning",
        hint: "Changes here (except brightness) take effect after a restart.",
        fields: [
          { key: "matrix_brightness", label: "Brightness", type: "slider", min: 0, max: 100 },
          {
            key: "matrix_pwm_bits",
            label: "Color depth (preview updates live)",
            type: "select",
            hint: "11 is the max for the Pi library (rpi-rgb-led-matrix). The panel supports 12-bit only with other controllers (Adafruit Protomatter on ESP32/SAMD, FPGA). Preview is an approximation — verify on hardware.",
            options: [
              { value: 11, label: "11-bit — full (Pi library max)" },
              { value: 10, label: "10-bit" },
              { value: 9, label: "9-bit" },
              { value: 8, label: "8-bit — bands dark tones" },
              { value: 7, label: "7-bit — visible banding" },
              { value: 6, label: "6-bit — high refresh, heavy banding" },
            ],
          },
          {
            key: "matrix_panel_type",
            label: "Panel chip",
            type: "select",
            options: [
              { value: "", label: "Default" },
              { value: "FM6126A", label: "FM6126A (fixes garbled/red)" },
              { value: "FM6127", label: "FM6127" },
            ],
          },
          { key: "matrix_gpio_slowdown", label: "GPIO slowdown", type: "number", min: 0, max: 6 },
          {
            key: "matrix_pwm_lsb_nanoseconds",
            label: "PWM LSB (ns)",
            type: "number",
            min: 50,
            max: 500,
            hint: "The main anti-flicker knob. Lower = higher refresh. Too low causes ghosting/black not fully off. Try 100; back off if you see trails.",
          },
          {
            key: "matrix_limit_refresh_rate_hz",
            label: "Refresh cap (Hz)",
            type: "number",
            min: 0,
            max: 1000,
            hint: "0 = unlimited. Pin to a steady value (e.g. 120) only if refresh varies visibly.",
          },
          {
            key: "matrix_hardware_mapping",
            label: "Wiring",
            type: "select",
            options: [
              { value: "adafruit-hat", label: "Adafruit HAT/Bonnet" },
              { value: "adafruit-hat-pwm", label: "Adafruit HAT (PWM mod)" },
              { value: "regular", label: "Direct GPIO / Active-3" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "music",
    label: "Music",
    sections: [
      {
        title: "Plex",
        hint: "Your Plex server URL + token.",
        fields: [
          { key: "plex_base_url", label: "Server URL", type: "text", placeholder: "http://192.168.1.50:32400" },
          { key: "plex_token", label: "Token", type: "secret" },
        ],
      },
      {
        title: "VLC",
        hint: "Enable VLC's Web interface and set a password (username stays empty).",
        fields: [
          { key: "vlc_base_url", label: "HTTP URL", type: "text", placeholder: "http://localhost:8080" },
          { key: "vlc_password", label: "Password", type: "secret" },
        ],
      },
      {
        title: "Last.fm",
        hint: "Universal — covers YouTube Music via scrobbling. Get an API key at last.fm/api.",
        fields: [
          { key: "lastfm_api_key", label: "API key", type: "secret" },
          { key: "lastfm_user", label: "Username", type: "text", placeholder: "your-lastfm-user" },
        ],
      },
    ],
  },
  {
    id: "wled",
    label: "WLED",
    sections: [
      {
        title: "WLED device",
        hint: "Sync the panel's on/off state with your WLED lights. Enable it in the WLED panel.",
        fields: [
          { key: "wled_base_url", label: "WLED address", type: "text", placeholder: "http://192.168.1.60" },
          {
            key: "wled_sync_direction",
            label: "Direction",
            type: "select",
            options: [
              { value: "panel_follows_wled", label: "Panel follows lights" },
              { value: "wled_follows_panel", label: "Lights follow panel" },
              { value: "mirror", label: "Mirror both ways" },
            ],
          },
        ],
      },
    ],
  },
];

const ALL_FIELDS = TABS.flatMap((t) => t.sections.flatMap((s) => s.fields));
const NUMERIC = new Set(["number", "slider"]);

export default function SettingsModal({ onClose, onSaved, onToast }) {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [tab, setTab] = useState("panel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [restartNote, setRestartNote] = useState(false);
  const [panelMap, setPanelMap] = useState([]);
  const [identifying, setIdentifying] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        const initial = {};
        for (const f of ALL_FIELDS) {
          initial[f.key] = f.type === "secret" ? "" : s[f.key] ?? "";
        }
        setForm(initial);
        setPanelMap(Array.isArray(s.matrix_panel_map) ? s.matrix_panel_map : []);
      })
      .catch((e) => setError(e.message));
  }, []);

  // Make sure identify is turned off when the settings modal closes.
  useEffect(() => {
    return () => {
      api.identifyPanels(false).catch(() => {});
    };
  }, []);

  const toggleIdentify = (on) => {
    setIdentifying(on);
    api.identifyPanels(on).catch((e) => onToast(`Error: ${e.message}`, true));
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Live resolution + panel count preview for the Panel tab.
  const resolution = useMemo(() => {
    const w = Number(form.matrix_panels_wide || 1) * Number(form.matrix_panel_cols || 64);
    const h = Number(form.matrix_panels_tall || 1) * Number(form.matrix_panel_rows || 64);
    const panels = Number(form.matrix_panels_wide || 1) * Number(form.matrix_panels_tall || 1);
    return { w, h, panels };
  }, [form.matrix_panels_wide, form.matrix_panels_tall, form.matrix_panel_cols, form.matrix_panel_rows]);

  async function save() {
    setBusy(true);
    try {
      const payload = {};
      for (const f of ALL_FIELDS) {
        const val = form[f.key];
        if (f.type === "secret") {
          if (val) payload[f.key] = val; // blank secret = unchanged
        } else if (NUMERIC.has(f.type)) {
          payload[f.key] = Number(val);
        } else {
          payload[f.key] = val;
        }
      }
      payload.matrix_panel_map = panelMap;
      const res = await api.updateSettings(payload);
      onToast("Settings saved");
      onSaved && onSaved();
      if (res.restart_required) {
        setRestartNote(true);
      } else {
        onClose();
      }
    } catch (e) {
      onToast(`Error: ${e.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  const currentTab = TABS.find((t) => t.id === tab);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${t.id === tab ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="err">⚠ {error}</p>}
        {!settings && !error && <p className="muted">Loading…</p>}

        {settings && (
          <div className="tab-body">
            {tab === "panel" && (
              <div className="res-badge">
                <strong>{resolution.w}×{resolution.h}</strong> px ·{" "}
                {resolution.panels} panel{resolution.panels === 1 ? "" : "s"}
              </div>
            )}

            {currentTab.sections.map((section) => (
              <div key={section.title} className="settings-section">
                <h3>{section.title}</h3>
                <p className="settings-hint">{section.hint}</p>
                {section.fields.map((f) => (
                  <Field
                    key={f.key}
                    field={f}
                    value={form[f.key]}
                    settings={settings}
                    onChange={(v) => setField(f.key, v)}
                  />
                ))}
              </div>
            ))}

            {tab === "panel" && resolution.panels > 1 && (
              <PanelLayout
                cols={Number(form.matrix_panels_wide || 1)}
                rows={Number(form.matrix_panels_tall || 1)}
                map={panelMap}
                onChange={setPanelMap}
                identifying={identifying}
                onIdentify={toggleIdentify}
              />
            )}
          </div>
        )}

        {restartNote && (
          <p className="restart-note">
            ⟳ Panel changes saved. Restart the app (or <code>systemctl restart
            pixel-pusher</code> on the Pi) to apply them.
          </p>
        )}

        <div className="actions modal-actions">
          <button className="primary" onClick={save} disabled={busy || !settings}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Field({ field, value, settings, onChange }) {
  const f = field;
  return (
    <div className="control">
      <label>
        {f.label}
        {f.type === "slider" && <span className="val"> {value}%</span>}
      </label>

      {f.type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {f.options.map((o) => (
            <option key={String(o.value)} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : f.type === "slider" ? (
        <input
          type="range"
          min={f.min}
          max={f.max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : f.type === "number" ? (
        <input
          type="number"
          min={f.min}
          max={f.max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={f.type === "secret" ? "password" : "text"}
          autoComplete="off"
          placeholder={
            f.type === "secret"
              ? settings[`${f.key}_set`]
                ? "•••••••• (set — leave blank to keep)"
                : "not set"
              : f.placeholder || ""
          }
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {f.hint && <span className="field-hint">{f.hint}</span>}
    </div>
  );
}
