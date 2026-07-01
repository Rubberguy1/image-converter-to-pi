import React from "react";

// Compact wattage + recommended-PSU badge based on the configured panel count.
export default function PowerWidget({ power }) {
  if (!power) return null;
  const title =
    `Estimated worst-case (full white) draw for ${power.panels} panel` +
    `${power.panels === 1 ? "" : "s"}: ~${power.max_amps} A @ 5 V (${power.max_watts} W).\n` +
    `Recommended supply: 5 V ${power.recommended_psu_amps} A ` +
    `(${power.recommended_psu_watts} W). ${power.note}`;
  return (
    <div className="power-widget" title={title}>
      <span className="pw-watts">⚡ ~{power.max_watts} W</span>
      <span className="pw-psu">PSU 5V {power.recommended_psu_amps}A+</span>
    </div>
  );
}
