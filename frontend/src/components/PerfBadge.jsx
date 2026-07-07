import React, { useEffect, useState } from "react";
import { api } from "../api.js";

// A tiny live readout of the Pi's actual load: how long a scene composite takes
// (and the fps that implies), process CPU%, and load average. Hover for detail.
export default function PerfBadge() {
  const [p, setP] = useState(null);

  useEffect(() => {
    let alive = true;
    const tick = () => api.perf().then((r) => alive && setP(r)).catch(() => {});
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!p) return null;
  const c = p.composite || {};
  const cpu = p.proc_cpu_pct;
  const load = Array.isArray(p.load_avg) ? p.load_avg[0] : null;

  const title = [
    `Composite: avg ${c.avg_ms}ms · max ${c.max_ms}ms (~${c.fps ?? "–"} fps)`,
    `Preview render: avg ${p.preview?.avg_ms ?? "–"}ms (${p.preview?.count ?? 0} total)`,
    `Process CPU: ${cpu ?? "–"}% of one core (includes matrix thread on the Pi)`,
    load != null
      ? `Load avg: ${p.load_avg.join(" / ")} across ${p.cpu_count} cores (~${p.cpu_count}.0 = saturated)`
      : `Cores: ${p.cpu_count} (load avg is Linux/Pi only)`,
    `Matrix backend: ${p.matrix_backend}${p.scene_enabled ? " · scene showing" : " · scene idle"}`,
  ].join("\n");

  const warn =
    (c.avg_ms && c.avg_ms > 12) || (load != null && p.cpu_count && load > p.cpu_count * 0.8);

  return (
    <div className={`perf-badge ${warn ? "warn" : ""}`} title={title}>
      <span>⚙ {c.avg_ms ? `${c.avg_ms}ms` : "idle"}</span>
      {cpu != null && <span>· {cpu}% cpu</span>}
      {load != null && <span>· ld {load}</span>}
    </div>
  );
}
