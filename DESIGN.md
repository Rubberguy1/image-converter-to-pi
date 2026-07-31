---
name: Pixel Pusher
description: A warm LED departure-board console — deep ink under a dot-matrix, one amber signal, board tiles.
colors:
  bg: "#0b0d13"
  panel: "#141824"
  panel-2: "#1e2432"
  border: "#2b3242"
  text: "#f3efe4"
  muted: "#8b93a6"
  accent: "#ffb62e"
  on-accent: "#17130a"
  accent-2: "#33d6a6"
  danger: "#ff5d5d"
  caution: "#f5a623"
typography:
  stat:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "normal"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 700
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
    letterSpacing: "0.07em"
  micro:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.65rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.05em"
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
  sm: "0.5rem"
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
    textColor: "{colors.on-accent}"
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
    padding: "0.5rem 0.6rem"
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
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "1rem"
  section-card:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "0.9rem 1rem"
  modal:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "1.2rem 1.4rem"
  status-led:
    backgroundColor: "{colors.accent-2}"
    rounded: "{rounded.full}"
    size: "9px"
  navbar-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.micro}"
  navbar-item-active:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    typography: "{typography.micro}"
---

# Design System: Pixel Pusher

## Overview

**Creative North Star: "The Signal Board"**

Pixel Pusher looks like a **warm LED departure board** — the polished console cousin
of the physical wall it drives. The ground is a deep ink you'd see behind unlit
pixels, textured by a faint **LED dot-matrix** so every surface reads as a board at
rest. A single **signage amber** is the one signal color: it lights the primary
action, the focus ring, the active tab, the on-screen indicators — and nothing
else. Text is a **warm lit-white**, never cold. It is emphatically *not* the cold
near-black dev-dashboard it replaced, and just as emphatically not generic
white-SaaS.

The interface is calm and legible because the operator is *doing a job* — composing
scenes and tuning hardware — but it is warm and approachable because a stranger has
to understand it too. Density is deliberate on desktop (a control console earns its
density); on phone it becomes a **native app with a bottom tab bar** and the live
panel as the hero. Live machine numbers (Hz, ms, watts, player counts, brightness)
are set in **tabular mono** so they read as board readouts, and small labels are
**uppercase and tracked** like silk-screened plate lettering.

Depth is flat by doctrine: surfaces are coplanar, separated by 1px hairline seams
or grouped into softly-rounded **board tiles**; only transient overlays (modals,
bottom-sheets, popovers) float. We reject the accent as a large fill, resting drop
shadows on cards, and pure-white reading text — those would break the board.

**Key Characteristics:**
- Deep ink ground under a faint amber LED dot-matrix — the signature.
- One warm signage amber, used only as signal (action / focus / active / status).
- Warm lit-white text; green "on-time" and red "alert" for state.
- Flat board tiles and hairline seams; shadows float overlays only.
- Tabular-mono readouts; uppercase tracked labels.
- Mobile is a bottom-nav app (Home · Editor · Scenes · Settings), canvas-first.

## Colors

A deep, slightly-cool ink ground lit by a single warm amber signal, with a small
functional green/red for state.

### Primary
- **Signal Amber** (`#ffb62e`): The one voice. Primary action, focus rings, the
  active-tab underline, the bottom-nav active indicator, the selection ring, live
  highlighted values. This is the lit LED; text/icons placed *on* it use the dark
  **On-Amber Ink** (`#17130a`), never white.

### Secondary
- **On-Time Green** (`#33d6a6`): "live / on / good" — the on-air dot (with a soft
  glow), status dots, success. The reassuring signal lamp.
- **Alert Red** (`#ff5d5d`): "offline / error / destructive" — failed states,
  delete/danger affordances.
- **Caution Amber** (`#f5a623`): rare warning accent (e.g. reduced-quality badges).

### Neutral
- **Ink** (`#0b0d13`): the app ground — the unlit board.
- **Board** (`#141824`): primary surface — cards, the modal, panels.
- **Raised Board** (`#1e2432`): buttons at rest, inputs, chips, section tiles.
- **Seam** (`#2b3242`): 1px borders and dividers.
- **Warm White** (`#f3efe4`): primary reading color — lit, warm, never pure #fff.
- **Dim Label** (`#8b93a6`): labels, hints, secondary text, inactive tabs/nav.

### Named Rules
**The Signal Rule.** Amber appears only as signal — the primary action, focus,
the active tab/nav, and lit indicators. It never fills a large surface; on any
screen it covers well under 10% of the pixels. Its rarity is what makes it read as
a lit LED.

**The Warm-White Rule.** Reading text is Warm White (`#f3efe4`), not pure `#ffff­ff`.
Pure white survives only as a scrim label on a black photo overlay (e.g. a thumbnail
delete). Text on amber uses On-Amber Ink (`#17130a`).

## Typography

**UI Font:** the system-ui stack (`-apple-system, Segoe UI, Roboto`) — no web fonts,
so the console stays fast and local-first.
**Readout Font:** `ui-monospace` — live machine numbers only.

**Character:** neutral and compact, with the *signage* accent carried by uppercase
tracked labels and tabular figures rather than a display face. Heading hierarchy
comes from weight and a tight scale, not large type; the one large step is a data
*stat*, not a headline.

### Hierarchy
A fixed six-step scale, exposed as CSS tokens (`--fs-xs … --fs-2xl`). Never use a
literal size; snap to a step.
- **Stat** (`--fs-2xl`, 1.4rem, 700): the single large data readout (a monitor
  number, `.mon-num`) and icon glyphs. Prominent *data*, not a heading.
- **Title** (`--fs-xl`, 1.15rem, 700): the header wordmark, the mobile greeting,
  page/editor titles.
- **Heading** (`--fs-lg`, 1rem, 600): section headings / panel headers.
- **Body** (`--fs-md`, 0.85rem, 400): default text, button labels, values.
- **Label** (`--fs-sm`, 0.75rem, 500, +0.07em, UPPERCASE): field labels, section
  headings inside Settings, nav-adjacent labels — the silk-screen plate layer.
- **Micro** (`--fs-xs`, 0.65rem, 500, +0.05em): tiny tags, thumbnail badges,
  bottom-nav labels.
- **Readout / Mono** (`--fs-sm` in the mono family, tabular-nums): Hz, ms, W, CPU %,
  brightness %, counts, versions.

### Named Rules
**The Readout Rule.** Anything reporting live hardware/machine state is mono with
`tabular-nums`; everything else is system-sans. If it's a number the device is
measuring right now, it's mono.

**The Scale Rule.** Type sizes and corner radii come only from the token scales
(`--fs-*`, `--r-*`). A literal `font-size` or `border-radius` in a rule is drift —
snap it to the nearest step.

## Layout

Two shells share one visual world:

- **Desktop** (>820px): a full-viewport app — a slim board-header (wordmark, status,
  perf/wattage, the music/WLED/mirror dropdowns, the gear) over a three-pane editor
  (gallery + scene controls · live canvas · layers). Panes scroll internally; the
  frame doesn't. Density is high and intentional; sections divide by 1px Seam
  borders. The settings **modal** caps at ~50vw and top-aligns.
- **Mobile** (≤820px): a **bottom-tab app** (`Home · Editor · Scenes · Settings`).
  One full-screen view scrolls at a time above a fixed bottom nav; the **live panel
  is the hero** on Home. Overlays become **bottom-sheets**; Settings renders inline
  as a full-height page. Touch targets are ≥42px.

Spacing is tight and rem-based on the token scale; content groups tightly, groups
separate generously (more space above a heading than below it).

## Elevation & Depth

**Flat by doctrine.** Surfaces are coplanar, separated by 1px **Seam** borders or
grouped into softly-rounded **board tiles**. There is no resting elevation. Depth
exists only to float **transient overlays**.

### Shadow Vocabulary
- **Overlay-high** (`box-shadow: 0 20px 60px rgba(0,0,0,0.5)`): the settings modal.
- **Overlay-mid** (`0 14px 36px rgba(0,0,0,0.55)`): header dropdowns / bottom-sheets.
- **Overlay-low** (`0 8px 24px rgba(0,0,0,0.45)`): popovers, the toast.
- **Focus ring** (`0 0 0 1px var(--accent) inset`): an inset amber ring on the
  focused control — a lit key, not depth.
- **Live glow** (`0 0 8px color-mix(in srgb, var(--accent-2) 70%, transparent)`):
  the only "glow" — the on-air green dot pulsing that it's live. Never decorative.

### Named Rules
**The Board Rule.** Resting surfaces are flat, defined by seams or tile borders,
never by shadow. A drop shadow means "this floats above the board," so it appears
only on overlays.

## Shapes

Restrained and rectilinear, softly rounded. **6px** (`--r-md`) is the workhorse for
buttons, inputs, chips; **8px** (`--r-lg`) for badges and readout cards; **12px**
(`--r-xl`) for the modal and the mobile board cards; **4px** (`--r-sm`) for tiny
chips and the nav indicator. Perfect circles (`--r-full`) are reserved for
**indicator LEDs** (status dots, the on-air dot) and the spinning album disc — so a
circle reads as "indicator." Borders are always 1px **Seam**; the active tab uses a
2px amber bottom-border, and the active bottom-nav item a short 2px amber bar. The
faint **LED dot-matrix** (`radial-gradient(var(--dot) 1px, transparent 1.6px)` at a
7px grid) is the one recurring texture — the board itself.

## Components

### Buttons
- **Shape:** softly squared (6px), compact padding, 0.85rem label. Smooth state
  transitions with a light 1px press on `:active`.
- **Default:** **Raised Board** fill with a 1px **Seam** border; hover shifts the
  border to **Signal Amber**.
- **Primary:** filled **Signal Amber** with **On-Amber Ink** text — the one lit
  action in a context.
- **Danger:** ghost with **Alert Red** text, for destructive actions.

### Inputs / Fields
- **Style:** **Raised Board** fill, 1px **Seam** border, 6px radius, `~0.5rem`
  padding, full width under a small uppercase **Label**. Themed at `.control` scope
  so text, number, and password fields match everywhere (modal and inline page).
- **Focus:** inset **Signal Amber** ring + amber border.

### Cards / Tiles
- **Board card** (`.card`): **Board** surface, 12px radius, 1px Seam — the mobile
  Home tiles and dashboards.
- **Section tile** (Settings sections): **Raised Board**, 8px radius, uppercase
  tracked heading — Settings reads as grouped tiles, not a flat list.
- **Shadow:** none at rest (The Board Rule).

### Navigation
- **Desktop tabs:** text-only, no background; inactive **Dim Label**, active **Warm
  White** with a 2px **Signal Amber** bottom-border.
- **Mobile bottom nav:** a fixed tab bar (icon + uppercase micro label). Inactive
  **Dim Label**; active **Signal Amber** with a short amber indicator bar sliding in
  above it and a light press-scale. Respects `prefers-reduced-motion`.

### Status LED (signature)
- A **9px circle** reporting state by color: **On-Time Green** = on/live (with a
  soft glow when on air), **Alert Red** = off/offline, **Seam/Dim** = idle. Always
  beside a text label. The literal embodiment of the North Star.

### Icons
- One in-house **monochrome SVG set** (`Icon.jsx`, 24×24 grid, 2px stroke,
  `currentColor`). No emoji anywhere in the chrome — icons inherit the text/muted
  color and only tint amber when they *are* the active signal.

## Do's and Don'ts

### Do:
- **Do** color through the tokens only — `var(--accent)` `#ffb62e`, `var(--accent-2)`
  `#33d6a6`, `var(--danger)` `#ff5d5d`, `var(--caution)` `#f5a623`; text on amber is
  `var(--on-accent)`.
- **Do** size type and corners only from the scale tokens (`--fs-*`, `--r-*`); snap
  any new value to the nearest step.
- **Do** keep the LED dot-matrix as the resting ground and keep surfaces flat —
  seams and tile borders define structure; shadows float only overlays.
- **Do** set live machine numbers in tabular mono; keep small labels uppercase and
  tracked.
- **Do** pair every status color with a label or icon (never hue alone), and keep a
  visible amber focus ring on every control.
- **Do** design mobile as the bottom-nav app with the live panel as the hero and
  ≥42px touch targets.

### Don't:
- **Don't** put white text on amber — use `var(--on-accent)`; and don't use pure
  `#ffffff` for reading text (that's `var(--text)`).
- **Don't** fill large surfaces or headers with the amber accent — it must stay a
  signal (<10% of a screen).
- **Don't** add resting drop shadows to cards/tiles (The Board Rule); the only glow
  is the live on-air dot.
- **Don't** write a literal `font-size` or `border-radius` — use the `--fs-*` /
  `--r-*` tokens.
- **Don't** reintroduce emoji as icons — use the monochrome SVG set.
- **Don't** revert mobile to stacked desktop panes; it is a bottom-nav app.
