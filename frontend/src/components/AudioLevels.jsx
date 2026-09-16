import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const BANDS = 24;
const SEND_MS = 80;

// Feeds live audio levels to the Pi for the music-mode waveform. The Pi hears
// nothing itself, so this browser captures audio — a shared tab/screen with
// "share audio" ticked (Chromium), or the microphone — and posts a few
// frequency bands several times a second. Needs a secure context (HTTPS or
// localhost), like the screen mirror.
export default function AudioLevels({ onToast }) {
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState("share"); // share | mic
  const [level, setLevel] = useState(0);
  const stop = useRef(null);
  const secure = typeof window !== "undefined" && window.isSecureContext;

  useEffect(() => () => stop.current && stop.current(), []);

  async function start() {
    let stream;
    try {
      if (source === "share") {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        stream.getVideoTracks().forEach((t) => t.stop());
        if (!stream.getAudioTracks().length) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error('no audio was shared — tick "Share audio" (or "Share tab audio") in the picker');
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      }
    } catch (e) {
      onToast(`Audio capture failed: ${e.message}`, true);
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.55;
    src.connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    // Log-spaced band edges from ~40 Hz to ~14 kHz.
    const nyq = ctx.sampleRate / 2;
    const binHz = nyq / an.frequencyBinCount;
    const lo = 40;
    const hi = Math.min(14000, nyq);
    const edges = [];
    for (let i = 0; i <= BANDS; i++) edges.push(lo * Math.pow(hi / lo, i / BANDS));
    let peak = 0.2;
    const timer = setInterval(() => {
      an.getByteFrequencyData(data);
      const bands = [];
      for (let i = 0; i < BANDS; i++) {
        const b0 = Math.max(0, Math.floor(edges[i] / binHz));
        const b1 = Math.max(b0 + 1, Math.floor(edges[i + 1] / binHz));
        let sum = 0;
        let n = 0;
        for (let k = b0; k < b1 && k < data.length; k++) {
          sum += data[k];
          n++;
        }
        bands.push(n ? sum / n / 255 : 0);
      }
      // Soft auto-gain so quiet sources still move the bars.
      const mx = Math.max(...bands, 0.01);
      peak = Math.max(mx, peak * 0.995);
      const gain = Math.min(3, 0.85 / peak);
      const out = bands.map((v) => Math.min(1, Math.pow(v * gain, 0.8)));
      setLevel(Math.max(...out));
      api.pushMusicLevels(out).catch(() => {});
    }, SEND_MS);
    const ended = () => stop.current && stop.current();
    stream.getAudioTracks().forEach((t) => t.addEventListener("ended", ended));
    stop.current = () => {
      clearInterval(timer);
      try {
        src.disconnect();
        ctx.close();
      } catch {
        /* ignore */
      }
      stream.getTracks().forEach((t) => t.stop());
      stop.current = null;
      setRunning(false);
      setLevel(0);
    };
    setRunning(true);
    onToast("Sending audio levels to the panel");
  }

  return (
    <div className="audio-levels">
      <label className="checkbox" title="Streams frequency levels from this browser for the music-mode waveform">
        <input
          type="checkbox"
          checked={running}
          disabled={!secure}
          onChange={(e) => (e.target.checked ? start() : stop.current && stop.current())}
        />
        Send audio levels for the waveform
        {running && <span className="level-meter" aria-hidden="true"><span style={{ width: `${Math.round(level * 100)}%` }} /></span>}
      </label>
      {!running && (
        <div className="row-tight">
          <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Audio source" disabled={!secure}>
            <option value="share">Shared tab / screen audio</option>
            <option value="mic">Microphone</option>
          </select>
        </div>
      )}
      <p className="field-hint">
        {secure
          ? source === "share"
            ? 'Pick the tab or screen that is playing and tick "Share audio". Without it the waveform is synthesized.'
            : "Uses the microphone; anything it hears drives the bars."
          : "Needs HTTPS or localhost (browser rule for audio capture). Until then the waveform is synthesized."}
      </p>
    </div>
  );
}
