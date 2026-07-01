"""Rough power-budget estimate for the configured panel setup.

Used to show a wattage/PSU recommendation in the UI. Numbers are worst-case
(full white) so the recommended supply has headroom; typical draw is much lower.
"""
from __future__ import annotations

import math

# Worst-case current at 5V.
AMPS_PER_PANEL = 4.0   # a 64x64 panel at full white
PI_AMPS = 2.0          # controller headroom
VOLTS = 5.0
PSU_LOAD_TARGET = 0.7  # size a PSU so full load is ~70% of its rating


def estimate(total_panels: int) -> dict:
    panels = max(1, total_panels)
    max_amps = panels * AMPS_PER_PANEL + PI_AMPS
    max_watts = max_amps * VOLTS
    # Recommend a PSU with headroom, rounded up to a sensible 5A step.
    rec_amps = math.ceil((max_amps / PSU_LOAD_TARGET) / 5) * 5
    return {
        "panels": panels,
        "max_amps": round(max_amps, 1),
        "max_watts": round(max_watts),
        "recommended_psu_amps": rec_amps,
        "recommended_psu_watts": rec_amps * int(VOLTS),
        "note": "Worst-case (full white). Typical draw is much lower.",
    }
