# Hardware: parts list & wiring

What you need to run a 64×64 RGB LED matrix and how it all connects.

## Parts list

| Part | Notes |
| --- | --- |
| **Raspberry Pi** | **Pi 4 (2–4GB) recommended.** Pi 3 B/B+ is fine for a single panel; Pi Zero 2 W works with less headroom. Avoid the Pi 5 (RP1 GPIO is poorly supported by the matrix library). |
| **64×64 RGB LED matrix (HUB75)** | Confirm it's HUB75 with an **E** address line (64-row panels need the E line; 32-row don't). Common pitch: P3 (192×192 mm) or P2.5. Many use FM6126A driver chips (see tuning). |
| **Adafruit RGB Matrix HAT or Bonnet** | *Strongly recommended.* Handles all HUB75 wiring through one ribbon connector plus 5V→3.3V level shifting and a barrel jack for panel power. HAT = full-size Pi, Bonnet = smaller. Works on any 40-pin Pi. |
| **5V power supply, 4A minimum (≥5A ideal)** | A 64×64 panel can pull ~3–4A at full white. **Do not power the panel from the Pi's GPIO 5V** — power it from the HAT's barrel jack / panel power terminals directly. |
| **Pi power supply** | Power the Pi separately from its USB (or from one supply — see "single plug" below). |
| **HUB75 ribbon cable** | Usually included with the panel; connects HAT → panel `IN` side. |
| **Panel power pigtail** | Usually included; spade/Molex to the panel's `+5V`/`GND` terminals. |
| microSD card (16GB+), and optionally a small heatsink | For Raspberry Pi OS. |

> Why the HAT/Bonnet: without it you must hand-wire 13+ GPIO lines and add level
> shifting for reliable color. The HAT removes all of that and is what the
> `rpi-rgb-led-matrix` library defaults to (`hardware_mapping=adafruit-hat`).

## Wiring (with the Adafruit HAT/Bonnet — the easy path)

```
[5V 4A+ PSU] ──► HAT barrel jack ──► (HAT screw terminals) ──► Panel +5V / GND
                                   └─ ribbon ─────────────────► Panel HUB75 "IN"
[Raspberry Pi] ── HAT seats on the 40-pin GPIO header
[Pi USB power] ──► Pi only
```

1. Seat the HAT/Bonnet firmly on the Pi's 40-pin header.
2. Plug the **HUB75 ribbon** from the HAT into the panel's **input** side (often
   labeled `IN`, `J1`, or has an arrow → ). The output side daisy-chains to more
   panels (not needed for one 64×64).
3. Connect the **panel power leads** to the HAT's 5V screw terminals (or directly
   to the PSU). Match `+5V`→red, `GND`→black.
4. Plug the **5V 4A+ PSU** into the HAT barrel jack.
5. Power the **Pi separately** via its own USB supply.

### The flicker mod (recommended, optional)
For the smoothest output, Adafruit's "quality" mod solders a jumper between GPIO4
and GPIO18 on the HAT, then you set `MATRIX_HARDWARE_MAPPING=adafruit-hat-pwm` in
`.env`. Skip it to start; add it later if you see flicker.

### Disable on-board sound (required for stable output)
The matrix library uses hardware that conflicts with the Pi's audio. The setup
script does this for you, but for reference it blacklists `snd_bcm2835`.

## Powering the Pi + panel from ONE supply (single plug)

You can run the whole project off one 5V supply instead of two bricks.

- **Size it for both loads:** panel ~4A + Pi ~2A → use a **5V 8–10A** supply
  (e.g. Mean Well LRS-50-5). Screw-terminal output is easiest to split.
- **Star-wire from the PSU:** run one 5V/GND pair to the panel's power harness and
  a **separate** pair to the Pi — don't daisy-chain the Pi through the panel, or
  the panel's current spikes will sag the Pi's rail and reboot it.
- **Feed the Pi safely** via a *screw-terminal → micro-USB* cable into the Pi's
  normal power port (keeps the Pi's input fuse). Avoid back-feeding the GPIO 5V
  pins (bypasses protection).
- Don't also connect the Pi's USB brick once it's powered from the PSU.
- Use thick (18 AWG), short leads for the panel; an inline 5A fuse on the panel
  leg is good practice.

Symptom that means your panel power is inadequate: solid **white turns reddish**
(green/blue brown out first) and brightness is uneven — the panel isn't getting
enough clean current. Fix the supply/wiring, not the software.

### Scaling to multiple panels (future)

Budget **~4A per 64×64 panel at full white**, plus ~2A for the Pi. So four panels
≈ **18A**; size a **5V ~30A** supply (run a PSU at 60–75% of rating). Big supplies
are open-frame — you wire **mains AC**; enclose it, fuse it, add strain relief.

Power distribution (don't run all the current down one wire, and don't chain
power through panels):

```
PSU ─(short THICK trunk 12-14AWG)─► bus bars/terminal block
                                     ├─18AWG─► panel 1
                                     ├─18AWG─► panel 2  (one 5V/GND feed each =
                                     ├─18AWG─► panel 3   "power injection")
                                     └─18AWG─► panel 4  (+ a feed to the Pi)
```

Wire gauge is limited by **voltage drop** (LEDs brown out below ~4.7V), not heat.
18 AWG one-way max length for <5% drop: ~10 ft @2A, **~5 ft @4A**, ~3 ft @6A. Keep
per-panel 18 AWG feeds ≤5 ft (shorter is better); use 12–14 AWG for the trunk.
Verify by measuring **≥4.7 V at the panel terminals under full white**.

### Scaling ladder (power + controller)

Budget ~4A/panel (white) for power, and note the controller is the real limit —
HUB75 refresh is CPU-bit-banged and drops as a *chain* lengthens, so split panels
across **parallel chains** rather than one long chain.

| Panels | 5V supply | Controller / driver |
|--------|-----------|---------------------|
| 1      | 5V 4–5A   | Pi 3/4 + Adafruit HAT (1 chain) |
| 4      | 5V ~30A   | Pi 4 + HAT (chain of 4) or 2 parallel chains |
| 8      | 5V ~60A (or 2× 30A zoned) | **Pi 4 + Active‑3 adapter** (3 parallel chains); arrange e.g. 256×128 |
| 8+     | multiple zoned supplies | Consider Colorlight receiver cards + sender for big walls |

For multiple supplies: **common all grounds**, keep each supply's 5V to its own
zone. Pi 4 wants `MATRIX_GPIO_SLOWDOWN=3–4` and benefits from `isolcpus=3`. The app
scales via the **Settings → Panel** menu (or `MATRIX_PANELS_WIDE` /
`MATRIX_PANELS_TALL`) — total resolution is derived from the panel counts.

## Direct GPIO wiring (no HAT)

Possible but fiddly — you must wire R1,G1,B1,R2,G2,B2, A,B,C,D,E, CLK, LAT, OE and
add a level shifter. If you go this route, use the `regular` hardware mapping and
follow hzeller's [wiring guide](https://github.com/hzeller/rpi-rgb-led-matrix/blob/master/wiring.md).
The HAT is worth it.

## Sanity check before software

- Panel input side connected (not the output side).
- Separate power for Pi and panel.
- PSU rated for the panel's full-white current.

Next: [PI_SETUP.md](PI_SETUP.md).
