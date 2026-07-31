---
name: Pixel Pusher
description: A dark instrument faceplate for driving an LED matrix — flat modules, glowing status LEDs, precise controls.
colors:
  bg: "#0e0f13"
  panel: "#1a1c23"
  panel-2: "#23262f"
  border: "#2e323d"
  text: "#e7e9ee"
  muted: "#9aa0ac"
  accent: "#5b8cff"
  accent-2: "#36d399"
  danger: "#ff5c6c"
  caution: "#f5a623"
typography:
  stat:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "normal"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  heading:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
  micro:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.65rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "50%"
spacing:
  xs: "0.3rem"
  sm: "0.45rem"
  md: "0.7rem"
  lg: "1rem"
  xl: "1.4rem"
components:
  button:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.9rem"
    typography: "{typography.body}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.9rem"
    typography: "{typography.body}"
  button-danger:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.9rem"
    typography: "{typography.body}"
  input:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0.45rem"
    typography: "{typography.body}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    padding: "0.4rem 0.7rem"
    typography: "{typography.body}"
  tab-active:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    padding: "0.4rem 0.7rem"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 0.7rem"
  modal:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "1.2rem 1.4rem"
  status-led:
    backgroundColor: "{colors.accent-2}"
    rounded: "{rounded.full}"
    size: "9px"
---

# Design System: Pixel Pusher

## Overview

**Creative North Star: "The Synth Rack"**

Pixel Pusher looks like the front of a well-made piece of dark studio hardware —
a eurorack module or a lighting console — that happens to live in a browser. The
near-black canvas is the anodized faceplate; hairline borders are the seams
between modules; and saturated color appears only as **status LEDs and lit
controls**, never as decoration. The physical LED wall is the real output, so the
interface deliberately stays dim and recessive: the glowing panel preview, album
art, and status lights are the brightest things on screen, exactly as they'd be
on a rack in a dark room.

The controls themselves are the opposite of showy. They're **precise and
utilitarian** — tight, consistent, instrument-grade — because this is an Operate
surface where the operator is composing scenes and tuning hardware, not being
sold to. Personality comes from the *faceplate and the LEDs*, not from flourish
on the buttons. Density is high and intentional: this is a control panel, and a
control panel earns its density by keeping every readout legible.

Depth is flat by doctrine. Modules sit coplanar, separated by 1px seams, and the
only things that float are transient overlays (the settings modal, popovers,
notification banners). We reject soft, dimensional "card" UI, resting drop
shadows, and any use of the accent as a large fill — those would turn a precise
instrument into a generic dashboard.

**Key Characteristics:**
- Near-black faceplate; cool blue-gray neutrals; color reserved for meaning.
- Saturated hues behave like LEDs — indicators and actions only.
- Flat modules divided by hairline seams; shadows float overlays only.
- Dense, compact, system-font UI with mono for live machine readings.
- Recessive by design so the panel content and previews are what glow.

## Colors

A cool, desaturated blue-gray faceplate lit by a small set of saturated
"indicator" colors that carry all the meaning.

### Primary
- **Signal Blue** (`#5b8cff`): The one voice. Primary actions, focus rings, the
  active-tab underline, key highlighted values (resolution, links). This is the
  "power/active" LED — the color that says *this is live or this is the main
  action*.

### Secondary
- **Ready Green** (`#36d399`): "Good / on / connected" — status dots, success
  badges, an online server, a healthy reading. The reassuring LED.
- **Fault Red** (`#ff5c6c`): "Error / offline / destructive" — failed states, an
  offline server, delete/danger affordances.
- **Caution Amber** (`#f5a623`): Rare warning accent — e.g. a reduced color-depth
  badge. Used sparingly for "heads-up, not broken."

### Neutral
- **Void** (`#0e0f13`): The app background — the faceplate itself, nearly black
  so everything luminous reads against it.
- **Faceplate** (`#1a1c23`): Primary surface — the modal, major panels.
- **Module** (`#23262f`): Raised surface — buttons at rest, inputs, chips,
  badges. One step up from the faceplate.
- **Seam** (`#2e323d`): 1px borders and dividers — the lines between modules.
- **Text** (`#e7e9ee`): Primary reading color, a cool near-white (not pure #fff).
- **Muted** (`#9aa0ac`): Labels, hints, secondary text, inactive tabs.

### Named Rules
**The LED Rule.** Saturated color appears only as indicators and actions —
status dots, the primary button, focus rings, the active tab, highlighted live
values. It never fills a large surface. On any screen the accent covers well
under 10% of the pixels; its rarity is what lets it read as a lit LED.

**The One-White Rule.** Body and UI text is the cool near-white **Text**
(`#e7e9ee`). Pure `#ffffff` is reserved for the label *on top of* a filled accent
button, where maximum contrast is the point. Don't use `#fff` for reading text.

## Typography

**Body / UI Font:** system-ui stack (`-apple-system, Segoe UI, Roboto`) — no web
fonts loaded; the native OS face keeps the console fast and neutral.
**Readout Font:** `ui-monospace` — for live machine numbers only.

**Character:** Neutral, compact, and unfussy — the type equivalent of a silk-screened
faceplate label. Small sizes are the norm; heading hierarchy comes from weight and
a tight scale, not from large display type. There is no display/hero *heading*
tier — this surface never shouts in prose. The one large step is reserved for a
*data* readout (a monitor number), not a headline.

### Hierarchy
A fixed six-step scale, exposed as CSS tokens (`--fs-xs … --fs-2xl`). Never use a
literal size; snap to a step.
- **Stat** (`--fs-2xl`, 1.4rem, 600): The single large data readout (a monitor
  number) and icon glyphs (⚙, ×). Prominent *data*, not a heading.
- **Title** (`--fs-xl`, 1.15rem, 600): Top page/editor title (`editor-head h2`).
- **Heading** (`--fs-lg`, 1rem, 600): Section titles (`settings-section h3`), panel headers.
- **Body** (`--fs-md`, 0.85rem, 400): Default text, button labels, values. Dense
  by design (below the 1rem web floor is justified for this control surface).
- **Label** (`--fs-sm`, 0.75rem, 500, +0.02em): Field labels, hints, secondary meta.
- **Micro** (`--fs-xs`, 0.65rem, 500): Tiny tags, thumbnail badges, addresses. The
  quiet silk-screen layer.
- **Readout / Mono** (`--fs-sm` in the mono family, 0.75rem, 400): Live machine
  state only — Hz, ms, watts, CPU %, player counts, versions.

### Named Rules
**The Readout Rule.** Anything that reports live hardware/machine state is set in
mono; everything else is system-sans. Mono is a semantic choice, not a stylistic
one — if it's a number the device is measuring right now, it's mono.

**The Scale Rule.** Type sizes and corner radii come only from the token scales
(`--fs-*`, `--r-*`). A literal `font-size` or `border-radius` in a rule is drift —
snap it to the nearest step or the ramp stops meaning anything.

## Layout

A full-viewport app shell (`height: 100vh; overflow: hidden`) with a slim top
**header** (status chips, perf/wattage readouts, actions) over an internally
scrolling body — panes scroll, the frame doesn't. The scene editor is the hero
surface: a canvas with a side rail of widgets/controls. Spacing is **tight and
rem-based** (gaps of 0.3–0.5rem, control padding ~0.45rem, section padding
1–1.4rem); density is a feature, not a bug. Sections within a panel are divided
by 1px **Seam** top-borders rather than whitespace alone. Responsive: both desktop
(drag/resize scene composition) and phone (quick tweaks) are first-class — controls
must stay thumb-reachable and panels must reflow to a single column on narrow
screens. Overlays (modal) cap at a compact `max-width` (~460px) and align to the
top of the viewport, not dead-center.

## Elevation & Depth

**Flat by doctrine.** Surfaces are coplanar and separated by 1px **Seam** borders,
like modules screwed onto a rack. There is no resting elevation — cards and panels
cast no shadow at rest. Depth exists only to lift **transient overlays** off the
faceplate.

### Shadow Vocabulary
- **Overlay-high** (`box-shadow: 0 20px 60px rgba(0,0,0,0.5)`): The settings
  modal — a deep, soft, near-black shadow that reads as "floating well above."
- **Overlay-low** (`box-shadow: 0 8px 24px rgba(0,0,0,0.45)`): Popovers,
  dropdowns, floating menus.
- **Focus ring** (`box-shadow: 0 0 0 1px var(--accent) inset`): Not depth — an
  inset accent ring marking the focused/active control (a lit key).

### Named Rules
**The Faceplate Rule.** Resting surfaces are flat and defined by seams, never by
shadow. A drop shadow means "this floats above the faceplate," so it may appear
only on overlays. If it's not an overlay, it gets a border, not a shadow.

## Shapes

Restrained, rectilinear, lightly softened. **6px** (`rounded.md`) is the
workhorse radius for buttons, inputs, chips, and badges; **8px** for larger cards;
**12px** for the modal; **4px** for tiny inline chips (inline `code`). Perfect
circles (`50%`) are reserved almost entirely for **status LEDs** and the spinning
album-art disc — so a circle on the faceplate reads as "indicator." Borders are
always 1px **Seam**; the active tab uses a 2px accent bottom-border as its only
"lit" edge. No pill-shaped buttons, no heavy rounding — the geometry stays
faceplate-crisp.

## Components

### Buttons
- **Shape:** Softly squared (6px radius), compact padding (0.5rem 0.9rem), 0.85rem label.
- **Default:** **Module** fill (`#23262f`) with a 1px **Seam** border — quiet at rest.
- **Hover:** Border shifts to **Signal Blue** (the control "lights up" on approach); fill unchanged.
- **Primary:** Filled **Signal Blue** with `#ffffff` label — the one lit action per context.
- **Danger:** Ghost style with **Fault Red** text; used for destructive actions (delete/remove).

### Chips / Badges
- **Style:** Small **Module** or transparent background, 0.6–0.7rem label, 4–8px radius.
- **Status badges:** color-coded text — **Ready Green** for good, **Caution Amber** for reduced-quality warnings — always paired with words, never color alone.

### Cards / Containers
- **Corner:** 8px (`rounded.lg`) for badges/readout cards; panels use the section pattern (1px **Seam** top-border, no radius).
- **Background:** **Module** (`#23262f`) for raised readouts; **Faceplate** (`#1a1c23`) for major panels.
- **Shadow:** None at rest (see The Faceplate Rule).
- **Padding:** 0.5–0.7rem for compact cards; 1–1.4rem for panels.

### Inputs / Fields
- **Style:** **Module** fill, 1px **Seam** border, 6px radius, 0.45rem padding, full-width within a `.control` block with a small **Label** above.
- **Focus:** Inset **Signal Blue** ring (`0 0 0 1px` inset) — the field lights.
- **Range/color/checkbox:** native controls, accent-tinted, kept compact.

### Navigation (Tabs)
- **Style:** Text-only buttons, no background, no radius. Inactive = **Muted**; active = **Text** with a 2px **Signal Blue** bottom-border. The underline is the single lit indicator of "where you are." Horizontal, scrollable when they overflow (the settings modal has six).

### Status LED (signature)
- A **9px circle** (`rounded.full`) that reports state by color: **Ready Green**
  = on/online, **Fault Red** = off/offline, **Muted** gray = unknown/idle. Always
  sits beside a text label. This is the system's signature element and the literal
  embodiment of the North Star — the LEDs on the faceplate.

## Do's and Don'ts

### Do:
- **Do** color exclusively through the tokens — `var(--accent)` `#5b8cff`, `var(--accent-2)` `#36d399`, `var(--danger)` `#ff5c6c`, `var(--caution)` `#f5a623`. Every accent/status color must resolve to one of these.
- **Do** size type and corners only from the scale tokens — `var(--fs-xs…--fs-2xl)` and `var(--r-sm…--r-full)`. Snap any new value to the nearest existing step; don't invent an intermediate literal.
- **Do** keep resting surfaces flat and define structure with 1px `var(--border)` seams; reserve shadows for overlays only.
- **Do** set live machine readings (Hz, ms, W, CPU%, counts, version) in mono; keep prose and labels in the system sans.
- **Do** pair every status color with a label or icon — an owner in a dark room and a color-blind maker both have to read it (status must never rely on hue alone).
- **Do** keep controls quiet at rest and let the accent appear only on interaction — hover border, focus ring, active-tab underline.
- **Do** default to 6px radius; reserve perfect circles for indicators (status LEDs, the spin disc).

### Don't:
- **Don't** hand-pick near-duplicate hexes (`#4ea1ff`, `#5fd08a`, `#ff7a7a`, `#f66`) — every accent/status color resolves to `--accent` / `--accent-2` / `--danger` / `--caution`. Off-token color erodes the LED Rule.
- **Don't** write a literal `font-size` or `border-radius` in a rule — use the `--fs-*` / `--r-*` scale tokens (The Scale Rule).
- **Don't** fill large surfaces or headers with a saturated accent — the LEDs lose meaning when everything glows.
- **Don't** add resting drop shadows to cards or panels (The Faceplate Rule).
- **Don't** use pure `#ffffff` for reading text; that's `--text` `#e7e9ee`. `#fff` is only for a label on a filled accent button.
- **Don't** introduce a large display/hero type tier — this surface communicates through weight and color, not size.
- **Don't** center the settings modal vertically or let it balloon — it stays top-aligned and compact (~460px).
