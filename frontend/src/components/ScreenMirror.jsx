import React, { useEffect, useRef, useState } from "react";

// Mirrors a cropped/downscaled view of the local screen to the panel. Capture
// happens in the browser (Screen Capture API); only panel-sized frames are sent
// to the Pi over a WebSocket. Requires a secure context (HTTPS or localhost).
const FPS = 15;
const supported =
  typeof navigator !== "undefined" &&
  navigator.mediaDevices &&
  typeof navigator.mediaDevices.getDisplayMedia === "function";

export default function ScreenMirror({ cols, rows, onChanged, onToast }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const [active, setActive] = useState(false);
  const [fit, setFit] = useState("cover");
  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  }, [fit]);

  useEffect(() => () => stop(), []); // cleanup on unmount

  function drawAndSend() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ws = wsRef.current;
    if (!video || !canvas || !ws || ws.readyState !== WebSocket.OPEN) return;

    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw && vh) {
      const panelA = cols / rows;
      const vidA = vw / vh;
      if (fitRef.current === "cover") {
        // crop the source to the panel aspect, fill the panel
        let sw, sh;
        if (vidA > panelA) {
          sh = vh;
          sw = vh * panelA;
        } else {
          sw = vw;
          sh = vw / panelA;
        }
        ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, cols, rows);
      } else {
        // contain: letterbox
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, cols, rows);
        let dw, dh;
        if (vidA > panelA) {
          dw = cols;
          dh = cols / vidA;
        } else {
          dh = rows;
          dw = rows * vidA;
        }
        ctx.drawImage(video, 0, 0, vw, vh, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
      }
      canvas.toBlob(
        (blob) => {
          if (blob && ws.readyState === WebSocket.OPEN) {
            blob.arrayBuffer().then((buf) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(buf);
            });
          }
        },
        "image/png"
      );
    }
    timerRef.current = setTimeout(() => requestAnimationFrame(drawAndSend), 1000 / FPS);
  }

  async function start() {
    if (!supported) {
      onToast("Screen capture needs HTTPS or localhost — see the note below.", true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      // browser "Stop sharing" button
      stream.getVideoTracks()[0].addEventListener("ended", stop);

      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/api/stream/ws`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      ws.onopen = () => {
        setActive(true);
        onChanged && onChanged();
        drawAndSend();
      };
      ws.onclose = () => stop();
      ws.onerror = () => onToast("Screen mirror connection error", true);
    } catch (e) {
      if (e && e.name === "NotAllowedError") return; // user cancelled the picker
      onToast(`Screen share failed: ${e.message}`, true);
    }
  }

  function stop() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const ws = wsRef.current;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    }
    const video = videoRef.current;
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    setActive(false);
    onChanged && onChanged();
  }

  return (
    <div className="mirror-panel">
      <h3>🖥️ Screen mirror</h3>
      <video ref={videoRef} style={{ display: "none" }} muted playsInline />

      {active && (
        <canvas
          ref={canvasRef}
          className="mirror-preview"
          width={cols}
          height={rows}
          style={{ aspectRatio: `${cols} / ${rows}` }}
        />
      )}
      {!active && <canvas ref={canvasRef} style={{ display: "none" }} />}

      <div className="control">
        <label>Fit</label>
        <select value={fit} onChange={(e) => setFit(e.target.value)}>
          <option value="cover">Cover (fill, crop edges)</option>
          <option value="contain">Contain (letterbox)</option>
        </select>
      </div>

      <div className="actions">
        {active ? (
          <button onClick={stop}>Stop mirroring</button>
        ) : (
          <button className="primary" onClick={start} disabled={!supported}>
            Share screen
          </button>
        )}
      </div>

      {active && (
        <p className="muted small">
          Mirroring ~{FPS} fps. Pick a window/screen in the browser dialog.
        </p>
      )}
      {!supported && (
        <p className="muted small">
          Needs a secure context (HTTPS or localhost). Over plain http the browser
          blocks screen capture — see docs for enabling HTTPS on the Pi.
        </p>
      )}
    </div>
  );
}
