# Scaling plan: 2 panels now → 8-panel wall (256×128) later

Goal: run **2 panels now**, expand to an **8-panel 4-wide × 2-tall wall (256×128)**
later, buying parts **once** so nothing gets thrown away.

End-state wall: 8 × 64×64 P3 panels = **256 × 128 px**, ~768 × 384 mm.

## Buy-once parts list

| Part | Buy | Runs 2 now? | Scales to 8? | Notes |
|------|-----|-------------|--------------|-------|
| **Identical 64×64 panels** | as you go | 2 | 8 | Buy the **same model** every time (same pitch + driver chip) so `panel_type`/timing stay uniform. Mixing models = config pain. |
| **Raspberry Pi 4** (2–4GB) | now | ✅ | ✅ | The 8-panel controller. Runs 2 effortlessly. (A Pi 3 + HAT also runs 2 fine, so this is optional until ~4+ panels — but the Pi 4 is the buy-once choice.) |
| **Active-3 adapter** (hzeller 3-chain board) | now | ✅ | ✅ | Gives **3 parallel HUB75 chains** — the Adafruit HAT only has 1, which flickers badly at 8. Uses the `regular` GPIO mapping. Needs light assembly/soldering. |
| **5V ~30A supply** (e.g. Mean Well LRS-150-5, 26A) | now | ✅ (13% load) | one **zone of 4** | Powers 2 now; later becomes "zone A" for 4 panels. |
| **2nd 5V ~30A supply** | at >4 panels | — | zone B (other 4) | Add only when you pass 4 panels. |
| Rigid frame (extrusion/wood), bus bars, 12–14 AWG trunk, 18 AWG feeds, fuses | at build time | — | ✅ | Mechanical + distribution for the wall. |

> A **Pi 3 + Adafruit HAT works for the 2-panel phase**. Buying the Pi 4 + Active-3
> up front is the "future-proof" path (no second controller purchase); deferring
> them until you actually expand is also fine if you already have a working
> controller. The **power supply and matching panels are the parts to get right now.**

## Phase 1 — 2 panels (128×64, side by side)

Wire the two panels as a single chain of 2. `.env`:

```ini
MATRIX_WIDTH=128
MATRIX_HEIGHT=64
MATRIX_CHAIN_LENGTH=2
MATRIX_PARALLEL=1
MATRIX_PANEL_TYPE=FM6126A
# If on Pi 4 + Active-3:
MATRIX_HARDWARE_MAPPING=regular
MATRIX_GPIO_SLOWDOWN=4
# If still on Pi 3 + Adafruit HAT:
# MATRIX_HARDWARE_MAPPING=adafruit-hat
# MATRIX_GPIO_SLOWDOWN=2
```

Power: one 30A supply, both panels power-injected from it, common ground with the Pi.

## Phase 2 — 8 panels (256×128, 4 wide × 2 tall)

Wire each **row of 4** as one chain, and the **2 rows** as 2 parallel chains on the
Active-3 (uses 2 of its 3 ports). The library then presents a native 256×128 canvas:

```
Active-3 port 0 ─► [P] [P] [P] [P]   (top row, chain of 4)   = 256×64
Active-3 port 1 ─► [P] [P] [P] [P]   (bottom row, chain of 4) = 256×64
                    stacked = 256×128
```

`.env`:

```ini
MATRIX_WIDTH=256
MATRIX_HEIGHT=128
MATRIX_CHAIN_LENGTH=4
MATRIX_PARALLEL=2
MATRIX_HARDWARE_MAPPING=regular
MATRIX_GPIO_SLOWDOWN=4
MATRIX_PANEL_TYPE=FM6126A
```

Power: 2 zones × 4 panels, each zone on its own 30A supply, **all grounds common**.
Trunk 12–14 AWG to per-zone bus bars, 18 AWG feeds to each panel (≤5 ft), fuse per zone.

Depending on how you physically run the two row-chains (same direction vs
serpentine), you may need a pixel-mapper (`U-mapper` / rotate) so the image lands
right side up — we'll confirm the exact wiring when you build it.

## Software notes for non-square walls

The app renders to any `WIDTH×HEIGHT`, but two things want a small tweak once the
panel isn't square (128×64, 256×128, etc.):

- **Spinning disc:** the current circular mask fills the whole rectangle, so on a
  non-square canvas it becomes an oval. Fix = center a true circle of diameter
  `min(width, height)`. Small change; do it when Phase 1 goes multi-panel.
- **Fit/letterbox:** decide whether album art fills height (with side bars) or
  fills the whole wall (cropped). Already controllable via fit mode per image.

## Controller recommendation & refresh-rate reality

**Use a Raspberry Pi 4 (2–4GB)** for the wall. It's the best-supported platform for
hzeller's library and holds a flicker-free refresh at 256×128. Avoid the Pi 5 (its
RP1 GPIO is poorly supported by this library). The Pi 3 is fine for 1–2 panels only.

**Two different "rates" — don't confuse them:**
- **Content frame rate** = animation fps (e.g. a 24 fps GIF). Easy on any Pi; the
  panel size barely affects it. A 12–24 fps target is trivial.
- **Panel refresh rate** = LED re-scan speed to avoid *flicker*. Must be **100 Hz+**
  (ideally 150–200). This is what stresses the controller.

HUB75 refresh drops with **chain length**, not total panels — that's why the wall
is 2 parallel chains of 4 rather than one chain of 8 (parallel chains run
simultaneously). On a Pi 4 with `chain=4`, `parallel=2`, `pwm_bits=11`, you get a
solid >100 Hz flicker-free refresh *and* 24+ fps content. For more headroom, lower
`MATRIX_PWM_BITS` (fewer color steps) or brightness, and set `isolcpus=3` in
`/boot/cmdline.txt` to dedicate a core to the display. Verify live Hz with the
demo's `--led-show-refresh`.
