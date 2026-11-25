# ALKYONE — BUILD CONTRACT (read fully before you write anything)

You are one member of a team building the flagship concept page for **Alkyone**, an infant monitoring system at concept stage.
The final product is ONE self-contained HTML file (inline CSS/JS). Several agents work in parallel on separate files that a build
script assembles. This document is the single source of truth: design plan, honesty rules, architecture, copy, section specs and test protocol.

## 0. Paths (Windows; Node handles forward slashes)

```
BUILD   = C:/Users/Master/AppData/Local/Temp/claude/429a84bea591d46a/b48aeb0d-536f-4789-9554-0e0ca3e4d48c/scratchpad/build
HARNESS = C:/Users/Master/AppData/Local/Temp/claude/429a84bea591d46a/b48aeb0d-536f-4789-9554-0e0ca3e4d48c/scratchpad/harness
SHOTS   = C:/Users/Master/AppData/Local/Temp/claude/429a84bea591d46a/b48aeb0d-536f-4789-9554-0e0ca3e4d48c/scratchpad/shots
```
Only write inside BUILD (and SHOTS for screenshots; use your own sub-folder `SHOTS/<your-role>/`). NEVER write into `C:/Users/Master/Desktop/my-site` (the final copy is made by the orchestrator).
Shell: Windows. Use the Bash tool (Git Bash) or PowerShell; quote paths. Node 24, Python 3.12 are available. Network works.
Look at your own screenshots with the Read tool (it displays images). **You must actually look at what you build and iterate until it is genuinely beautiful** — "it renders without errors" is not the bar.

## 1. The brief (verbatim essentials) and HONESTY RULES

Audience: a busy reader with no technical background (a judge, a parent, a clinician). Plain language. Short sentences. One idea per screen.
Technical terms (BLE, IMU, SpO2 …) get a hover/tap explanation. Quality bar: premium, calm product-launch page; generous spacing; refined type pairing;
soft blues/teals with ONE warm accent; smooth scroll-driven storytelling; no stock-template look; no clichés (no baby photos, no stethoscope icons).

Story (each scene: a visual + 1–2 lines of text):
1 Hero: stylized low-poly 3D infant torso with a small flexible-circuit patch; headline "Designed so the alert actually reaches the parent."
2 The patch: orbit/zoom; hotspots for heart rate and SpO2 (optical), skin temperature, motion/orientation (IMU), microphone (processed on the device, no audio stored), wear-detection.
3 The ring: discreet ring on a hand; "simulate event" shows a pulse traveling over an animated Bluetooth Low Energy link and the ring vibrating with different patterns (routine vs needs attention); "simulate lost signal" shows silence itself raising an alert (heartbeat); tap-to-acknowledge.
4 The app: realistic phone mockup (HTML/CSS) with 4 swipeable screens: live vitals, sleep timeline, alert history, and a "Log" screen where the parent adds entries by hand (feeding, diaper change, sleep start/stop, medication, notes). Manual entries appear in the timeline next to the sensor data. All values and entries are SIMULATED and labelled "Simulated data".
5 Sleep visualization (exploratory): stylized figure whose posture (back / side / tummy) is driven by simulated IMU orientation, with a timeline scrubber to replay a simulated night. Label: "Exploratory visualization of simulated data". Do NOT imply full 3D body reconstruction from a single sensor.
6 Future work (exploratory chips): escalation of unacknowledged alerts to a second caregiver; machine learning on personal baselines; predictive maintenance of the electronics (battery, sensor contact, signal quality); on-device cry classification; sleep staging; clinician-ready reports.
7 Team: Eleni Dimoula (pediatrician), Emmanouil Giannakis (AI engineer), Andreas Rigoutsos (ECE, hardware and sensor fusion). Photo placeholders.
8 Footer: visible "Concept stage – not a medical device" notice, contact placeholder.

**HONESTY RULES (hard):**
- Do NOT invent testimonials, numbers, certifications, awards, clinical results, accuracy figures, partners, battery life, response times, "normal ranges", user counts, studies, quotes, bios, degrees, affiliations.
- No claim of diagnosis, treatment, or SIDS prevention. No "safe/safer", "peace of mind", "never miss", "guarantee", "clinically", "proven", "accurate", "medical-grade", "real-time/instant" (the word "live" is allowed only as the name of the Live screen and in simulated-UI context).
- Do not claim the product monitors breathing, apnea, or "detects" any condition. Sensors are exactly: optical (heart rate + SpO2), skin temperature, IMU (motion/orientation), microphone (processed on device, no audio stored), wear detection.
- Everything that looks like data (vitals, timelines, alert history, posture replay, entries) is SIMULATED and carries a visible "Simulated data" tag (or, for the sleep scene, the exact label "Exploratory visualization of simulated data").
- Future-work items are "Exploratory": never describe them as built, tested, or coming soon.
- Photo placeholders must be obviously placeholders. Team roles exactly as listed above; no invented bios ("Short bio to come." is fine).
- No numbers presented as facts about the product. Numbers are allowed only inside clearly simulated UI (labelled) or as section numerals (1–7).
- Technical-term definitions (glossary) are general knowledge and must be neutral and modest; they must not promise performance.
- A statement of design INTENT that goes beyond the brief (e.g. "the ring buzzes until acknowledged") is acceptable only if it is a modest consequence of the brief; list it in your `claims` report with basis `design-intent`.
- Every agent MUST report every factual statement it put on the page in the `claims` field of its result (see §9) so the final audit can list statements the brief does not support.

## 2. DESIGN PLAN (art direction, type, color, motion, structure)

**Art direction — "a quiet instrument".** Editorial field-guide feel, not a SaaS template: hairline rules, numbered scenes, small figure captions ("Fig. 2 — illustration, not to scale"),
generous asymmetric whitespace, large serif numerals for data. The page is a night in miniature: pale dawn mist → deep teal night (patch, sleep) → light again.
Visual signature: luminous, flat-shaded low-poly forms (faceted triangles in 4–6 tints of blue/teal) + ONE warm apricot "night-light" accent used ONLY where attention is the point:
the patch pulse, alert states, hotspots, the italic phrase in the hero headline, the active star in the section rail. Everything else is blue/teal/ink.
Brand motif: Alkyone is a star of the Pleiades. The wordmark carries a tiny four-point star; on desktop a seven-star cluster rail (one star per scene) shows progress. Night sections may carry a faint star field.
Anti-patterns (do NOT do): centered hero with two gradient buttons; grid of identical rounded icon-cards; purple/neon gradients; heavy glassmorphism; emoji; stock icon sets; stethoscopes, bottles, pacifiers, teddy bears, storks, crescent-moon lullaby clichés, ECG-heart logos as decoration; photos; walls of text.

**Type.** Display: *Instrument Serif* (400, italic for emphasis; never faux-bold). UI/body: *Figtree* (variable 400–700, tabular figures for data). Both embedded base64 woff2 (latin subset) with `font-display: swap`. Fallbacks: `'Iowan Old Style','Palatino Linotype',Georgia,serif` / `system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`.
Use ONLY characters present in the latin subset in text (Latin-1 + general punctuation U+2000–206F: en/em dash, middle dot, curly quotes, ellipsis, bullet, °, ×, minus U+2212). NO unicode arrows/ticks/subscripts (use inline SVG icons; write SpO<sub>2</sub> with `<sub>`).
Scale (fluid): display `clamp(2.7rem,1.2rem + 7.4vw,6.4rem)` lh .98 ls -.02em · h2 `clamp(2.1rem,1.1rem + 4.2vw,4.2rem)` lh 1.02 · lede `clamp(1.08rem,1rem + .6vw,1.4rem)` lh 1.5 · body 1rem/1.6 · small .875rem · label .75rem uppercase ls .14em. Body copy never below 16px on phones; UI micro-labels never below 12px. Measure: h2 ≤ 18ch-ish, lede ≤ 52ch.

**Color tokens** (foundation may tune a few values to hit contrast; final values are in FOUNDATION.md / base.css — always use the tokens, never raw hex in section CSS):
```
mist:  --mist-50 #F6FAFB  --mist-100 #EDF4F7  --mist-200 #DDEAF0  --mist-300 #C6D9E3
ink:   --ink-900 #0B1D2A  --ink-800 #14293A  --ink-700 #2A4457  --ink-600 #46606F
night: --night-950 #050F18 --night-900 #071723 --night-800 #0B2231 --night-700 #103142 --night-600 #17465A
moon:  --moon-50 #EAF4F7  --moon-200 #B6CDD6   (text on night)
teal:  --teal-300 #8ED8D0 --teal-400 #5CC3BA --teal-500 #2FA8A0 --teal-600 #1F8B87 --teal-700 #146D72 --teal-800 #0F5459
blue:  --blue-300 #A9CBE8 --blue-400 #7FB0DA --blue-500 #5A94C8 --blue-600 #3D77AB
warm (the ONE accent, apricot/amber): --warm-200 #FFD9B0 --warm-300 #FBC285 --warm-400 #F6A95F --warm-500 #EE8F3C --warm-600 #D4741F --warm-700 #A9560F
```
Semantic theme variables set by `[data-theme="mist" | "mist-teal" | "night"]`: `--bg --bg-2 --fg --fg-muted --line --surface --surface-2 --accent --accent-ink --warm --warm-ink --focus`. Section CSS uses ONLY semantic vars where possible so components work in every theme.
Contrast: body text ≥ 4.5:1; large text (≥ 24px, or ≥ 19px bold) and UI boundaries ≥ 3:1; warm accent as TEXT on mist must use `--warm-700` (or `--warm-600` only at display size); on night use `--warm-300/400`. White text on teal buttons needs `--teal-700` or darker.
Theme rhythm: hero `mist` → patch `night` → ring `mist` → app `mist-teal` → sleep `night` → future `mist` → team `mist-teal` → footer `night`. Theme changes blend through a ≥ 120px gradient seam (no hard edges).

**Motion.** One signature easing `--ease-out: cubic-bezier(.22,.9,.24,1)`; `--ease-in-out: cubic-bezier(.65,.05,.25,1)`; durations `--dur-1:140ms --dur-2:240ms --dur-3:480ms --dur-4:900ms`. Only animate `transform`/`opacity` (and SVG stroke-dashoffset / canvas). Reveals: opacity + 14–18px rise, stagger 60–90 ms; hero headline lines rise through a mask.
Scroll-driven: native scroll only (never hijack). core.js sets `--p` (0→1) on each scene; scenes use it for camera dolly, phone tilt, line-draw, parallax (small amplitudes).
Ambient motion is slow (6s breathing, patch pulse) and stops when the section is off-screen, the tab is hidden, or `prefers-reduced-motion: reduce`.
Reduced motion: no parallax, no looping, no shake; reveals become instant; the 3D renders a still frame (user-driven orbit is still allowed). User-TRIGGERED simulations still work but replace travel/shake with fades and step highlights.
Mid-range phone budget: transform/opacity only, no large blur filters or backdrop-filter on big areas, `content-visibility:auto` on offscreen scenes where safe, ≤ 2 WebGL contexts, pixel-ratio capped.

**Structure.** `<header>` nav → `<main id="main">` with 7 `<section class="sec" id=…>` in this order: `hero, patch, ring, app, sleep, future, team` → `<footer id="footer">`. Each scene: scene header (eyebrow with numeral + h2 + lede, ≤ 2 short sentences) and ONE visual "plate" (rounded, hairline border, tinted ground, optional caption "Fig. N — …"). Asymmetric 12-col grid on desktop (text 5 cols / visual 7 cols, alternating sides); single column on phones, visual directly under the header. Scene padding `clamp(88px,14vh,168px)` block.

## 3. ARCHITECTURE

```
BUILD/
  CONTRACT.md                this file
  build.mjs                  assembler  (foundation agent writes it)
  src/
    template.html            page skeleton: <head>, nav, <main> slots, footer, live region, tooltip element
    fonts.css                base64 woff2 @font-face (Instrument Serif 400/400i, Figtree variable)
    base.css                 tokens, themes, reset, typography, layout, components, nav, footer
    core.js                  window.Alkyone runtime (see §4)
    sections/
      shared/*.js            shared modules, concatenated BEFORE section scripts, lexical order (e.g. infant-model.js, infant3d.js)
      hero/  section.html section.css section.js
      patch/ section.html section.css section.js
      ring/  app/  sleep/  future/  team/   (same 3 files each)
  dev/                       throw-away test pages (any agent may write here; name them after yourself)
  dist/index.html            the assembled deliverable
  FOUNDATION.md              API + class + token reference written by the foundation agent
```
`node BUILD/build.mjs` → `dist/index.html`. `node BUILD/build.mjs --only ring --out BUILD/dev/ring.html` builds a page with foundation + only that section (other sections become empty placeholders) so each agent can test in isolation without touching others' files.
Build directive in section.html: `<!--@include relative/path.html-->` inlines another file (used for generated SVG). The build FAILS on: any `http(s)://` URL in the output other than `cdnjs.cloudflare.com` / `cdn.jsdelivr.net` (Three.js only) and `www.w3.org` (xmlns); `@import`; `<link rel=stylesheet>`; external `<script src>`.

**Rules for section modules**
- `section.html`: exactly ONE root: `<section id="ID" class="sec" data-theme="…" aria-labelledby="ID-title"> … </section>`; no `<style>`, no `<script>`, no inline event-handler attributes.
- `section.css`: every selector starts with `#ID` or an `.ID-…` class (e.g. `.ring-link`). No global element selectors (`h2{…}`), no `!important` except in `@media (prefers-reduced-motion)` blocks. Use tokens from base.css. Local custom properties must be prefixed (`--ring-…`).
- `section.js`: plain JS in an IIFE that calls `Alkyone.section('ID', {...})`. No globals, no libraries, no `eval`, no `console.log`. Guard against missing elements. Never throw: wrap risky init in try/catch and degrade gracefully.
- Do not edit foundation files (`base.css core.js template.html build.mjs fonts.css`) or another section's files. If you need a foundation change, list it in `foundationRequests` and work around it locally.
- All graphics are inline SVG / CSS / canvas. No external images or fonts. Icons are inline SVG (`aria-hidden="true" focusable="false"`), stroke 1.5px, rounded caps, drawn for this page (not a stock set).
- American English spelling (pediatrician, diaper, color).

## 4. `window.Alkyone` runtime (implemented by core.js; FOUNDATION.md is authoritative)

```js
Alkyone.reduced            // boolean, live (updates when the OS setting changes)
Alkyone.lowPower           // boolean heuristic: hardwareConcurrency<=4 || deviceMemory<=4 || saveData || coarse+small screen
Alkyone.section(id, { init(ctx), enter(ctx), leave(ctx), progress(p, ctx), resize(ctx), reducedChange(isReduced, ctx) })
   // init: ONCE, when the scene first comes within ~1 viewport (may return a Promise). enter/leave: scene becomes visible / fully leaves.
   // progress: every frame while visible; p 0→1 from "top touches viewport bottom" to "bottom touches viewport top". resize: debounced.
   // ctx = { id, el, get reduced(), lowPower }
Alkyone.raf(fn)            // subscribe to the shared rAF loop: fn(t_ms, dt_ms); returns unsubscribe(); loop sleeps with 0 subscribers and when document.hidden
Alkyone.onResize(fn)       // debounced
Alkyone.announce(msg, {assertive})   // screen-reader status (aria-live polite by default)
Alkyone.loadThree()        // Promise<THREE|null>; memoized; dynamic import of Three r160 ESM: cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js then cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js; 10s total timeout; never rejects
Alkyone.hasWebGL()         // boolean, cached
Alkyone.vibrate(pattern)   // safe navigator.vibrate wrapper (no-op if unsupported)
Alkyone.defineTerm(key, htmlText) // register glossary term; <button class="term" data-term="key">BLE</button> auto-binds a tooltip (hover, focus, tap; Esc closes; role=tooltip; aria-describedby)
Alkyone.util = { clamp, lerp, mix, smoothstep, easeOutQuint, easeInOutCubic, easeOutBack, rng(seed) /*mulberry32*/ }
```
Declarative helpers: `[data-reveal]` (+ `data-reveal-delay="1..6"`) fades/rises in when scrolled into view (content is fully visible when JS is off or reduced motion is on — reveal CSS lives under `.js`).
Components in base.css (names are binding): `.container .eyebrow .h-display .h2 .lede .btn .btn--primary .btn--ghost .chip .sim-tag .exp-tag .plate .plate__caption .term .sr-only .placeholder .seam`. `.sim-tag` renders the text "Simulated data" with a small dot; `.exp-tag` renders "Exploratory".

**Glossary (exact text, core.js must register these keys; sections may add more with defineTerm):**
- `ble` — "Bluetooth Low Energy: the short-range wireless used by many wearables. It is designed to use very little battery."
- `imu` — "Inertial measurement unit: a tiny motion sensor, like the one that turns your phone screen sideways. It feels movement and tilt."
- `spo2` — "SpO<sub>2</sub> is the oxygen level in the blood, shown as a percentage. It is estimated by shining light through the skin."
- `optical` — "Optical means it uses light. Tiny lights shine on the skin and a sensor reads what comes back."
- `heartbeat` — "A tiny “I am still here” message the patch sends on a steady rhythm. If the messages stop, the ring knows something is wrong."
- `ece` — "Electrical and computer engineering: designing circuits, sensors and the software that runs on them."
- `fusion` — "Sensor fusion: combining readings from several sensors so they can cross-check each other."
- `ml` — "Machine learning: software that learns patterns from examples instead of following fixed rules."
- `baseline` — "What is typical for one particular baby, rather than for babies in general."
- `flex` — "A flexible circuit: electronics on a thin, bendable film instead of a rigid board, so it can follow the body’s curves."
- `ondevice` — "The sound is processed inside the patch itself. No audio is stored."
- `escalation` — "Passing an unanswered alert on to someone else."
- `maintenance` — "Spotting that the electronics are wearing down, such as a weak battery, poor skin contact or a fading signal, before they cause trouble."
- `staging` — "Splitting sleep into stages, such as lighter and deeper sleep."

## 5. COPY DECK (use verbatim for headings/ledes; microcopy may be refined within the same voice and the honesty rules)

Voice: calm, plain, warm, short sentences, no hype, no exclamation marks, "the baby", "you".
- **Nav pill**: "Concept stage – not a medical device" (on < 480px show "Concept stage"; the full text stays in an `sr-only` span).
- **Hero** — eyebrow "Infant monitoring · concept". H1 (exact): "Designed so the alert actually reaches the parent." (italic serif emphasis on "actually reaches", in warm). Lede: "A soft patch on the baby. A quiet ring on you. Alkyone is a concept built around one question: will the alert get through?" Notice chip: "Concept stage – not a medical device". Scroll cue: "Scroll".
- **Patch** — eyebrow "1 · The patch". H2 "A small patch that notices." Lede "It sits on the chest. Tap a dot to see what each part does." Helper "Drag to turn. Pinch or scroll to zoom." Caption "Fig. 1 — Illustration, not to scale."
  Hotspots (title / text):
  1. "Heart rate and SpO<sub>2</sub>" / "Light shines on the skin and an optical sensor reads the pulse and the oxygen in the blood."  (terms: optical, spo2)
  2. "Skin temperature" / "A small sensor reads the temperature of the skin under the patch."
  3. "Motion and position" / "An IMU feels movement and tilt, so the patch knows when the baby is still, moving or has turned."  (term: imu)
  4. "Microphone" / "Listens for sound. The sound is processed on the device itself, and no audio is stored."  (term: ondevice)
  5. "Wear detection" / "Knows whether the patch is touching skin. If it comes off, that is something to tell you about, not a reason to go quiet."
- **Ring** — eyebrow "2 · The ring". H2 "The alert goes to your hand." Lede "The ring buzzes in different patterns. One for routine, another for needs attention." Controls: segmented "Routine | Needs attention", button "Simulate event", button "Simulate lost signal" (becomes "Restore signal" while lost), hint "Tap the ring to acknowledge." Status lines: idle "Linked. The patch sends a steady heartbeat." · routine "Routine: one soft buzz. Nothing to do." · attention "Needs attention: a firm pattern that repeats until you acknowledge it." · lost "No heartbeat from the patch. Silence is treated as an alert." · ack "Acknowledged. The patch and the app are told." Caption "Fig. 2 — Illustration. The link and the alerts are simulated." Tag: `.sim-tag`. Terms: ble, heartbeat.
- **App** — eyebrow "3 · The app". H2 "Everything in one calm place." Lede "Swipe through four screens. Add your own notes and watch them land on the timeline beside the sensor data." Tabs "Live · Sleep · Alerts · Log". Caption "Fig. 3 — All values and entries are simulated."
- **Sleep** — eyebrow "4 · Sleep position · exploratory". H2 "A simulated night, replayed." Lede "Drag the timeline. The figure turns as the patch tilts." Label (exact): "Exploratory visualization of simulated data". Limits note: "One sensor on the chest can tell how the chest is tilted. It cannot see arms, legs or head." Pose labels "On back / On side / On tummy". Line: "It shows position. It does not diagnose or judge."
- **Future** — eyebrow "5 · What comes next · exploratory". H2 "Ideas we want to explore." Lede "None of these is built or promised. Tap one to read it." Chips (title — one-liner), each with `.exp-tag`:
  Second-caregiver escalation — "If nobody acknowledges an alert, pass it on to a second person." · Personal baselines — "Machine learning that learns what is typical for this baby, not babies in general." · Self-checking electronics — "Predictive maintenance: warn about a weak battery, poor skin contact or a fading signal before they cause trouble." · Cry classification — "Work out what kind of cry it is, right on the device." · Sleep staging — "Split a night into lighter and deeper sleep." · Clinician-ready reports — "A clear summary that a clinician can read quickly."
- **Team** — eyebrow "6 · The team". H2 "The people behind Alkyone." Lede "A pediatrician and two engineers." Cards: "Eleni Dimoula — Pediatrician" · "Emmanouil Giannakis — AI engineer" · "Andreas Rigoutsos — ECE · hardware and sensor fusion" (terms ece, fusion). Each: photo placeholder (arch-shaped frame, initials, tiny label "Photo placeholder"), "Short bio to come."
- **Footer** — big line "Concept stage – not a medical device". Fine print: "Alkyone is a concept. Anything on this page that looks like data is simulated, and nothing here is a clinical result. It is not designed to diagnose, treat or prevent any condition, including SIDS." · "Illustrations are conceptual and not to scale." · "Contact" + `hello@alkyone.example` + `.placeholder` tag "Placeholder" (plain text, not a mailto link) · "Back to top".

## 6. SECTION SPECS

### 6.1 Nav + footer + scroll rail (foundation)
Fixed top bar 56px: wordmark (4-point star mark + "Alkyone" in the serif) left, concept-stage pill right; transparent over hero, translucent after 24px scroll; its colors follow the theme of the scene beneath (`html[data-nav="mist|night"]` set by core.js). 2px page-progress line under it (scaleX). Desktop ≥ 1100px: fixed right-edge seven-star rail (`<nav aria-label="Scenes">`, links to the seven sections, current star warm + larger, hairlines connect stars, labels appear on hover/focus); hidden on phones. Skip link first in DOM. `<noscript>` note is not needed; all content must be readable without JS.

### 6.2 Hero (owner: 3D agent)
Full-viewport (min-height 100svh), `mist`. Phone: copy on top, 3D stage below (≈ 52svh), notice chip and scroll cue at the bottom. Desktop: copy left (cols 1–6), 3D right (cols 6–12) with soft overlap. H1 per copy deck with the headline lines rising through a mask on load.
3D: stylized low-poly infant TORSO (neck-to-hips with short arm stubs; faceless; no skin-tone realism; calm, not uncanny; faceted flat shading, vertex-tinted blue/teal ramp) wearing a small flexible-circuit patch on the chest (amber flex core visible, softly pulsing in warm). Soft rim light, transparent canvas over mist radial gradients, top/bottom edges fade via CSS mask. Idle: slow yaw sway + pointer parallax + scroll-linked yaw (small). Inline SVG fallback (same geometry, projected and flat-shaded at build time) is in the HTML and visible immediately; canvas cross-fades over it once ready; if WebGL/Three fails or times out the SVG stays (with a CSS-only pulse).

### 6.3 Patch (owner: 3D agent)
Theme `night`. 3D viewer plate (square-ish, max ~ 640px) + controls: rotate left/right, tilt up/down, zoom in/out, reset — all real `<button>`s ≥ 44px; plus pointer drag (horizontal drag = yaw, vertical on mouse = pitch), wheel zoom (only with Ctrl/⌘ or when the viewer is focused/active so page scroll is never trapped), two-finger pinch, keyboard (arrows/+/−/0 when the viewer is focused). Canvas `touch-action: pan-y` so vertical swipes still scroll the page. Camera starts framed on the upper chest and dollies toward the patch as scene progress goes ~0.2→0.55 until the user interacts (then user owns the camera). Damped orbit with sensible limits.
Five hotspots (copy deck) rendered as real buttons over the 3D (projected each frame, hidden/faded when facing away) AND as a button list/tabs (primary keyboard/touch path; also the SVG-fallback path). Selecting one: warm ring pulses at the component, camera eases to a close framing, a detail card shows title + text with glossary terms. Cards are short. If no WebGL: a large inline SVG of the patch with the same five hotspots and zoom buttons.
Patch model: soft rounded body, amber flex-circuit core with serpentine traces, small optical window (2 tiny emitters + sensor), IMU chip, temp bead, mic port, contact pads (wear) — shown as if seen through a translucent cover; designed, not photographed.

### 6.4 Ring (owner: ring agent)
Theme `mist`. Plate with an SVG scene: patch glyph (on a hint of chest curve) ⟶ animated BLE link ⟶ discreet ring on a hand. The hand is a faceted/flat-shaded illustration in the same tint ramp as the torso (tonal blue-grey, NOT skin-colored, no emoji hand); the ring is a slim band that glows teal (linked) / warm (alert). Options: generate the faceted hand with a small Node script (primitives → projection → flat-shaded SVG polygons) and `<!--@include-->` the output.
States (state machine; announce every change via `Alkyone.announce`): `idle` (heartbeat ping travels patch→ring every ~2.2 s; "heard just now") · `event-routine` (pulse travels the link, ring gives ONE soft buzz: small ripple, pattern strip shows one short bar; auto-clears after ~2 s) · `event-attention` (pulse travels, ring buzzes a firm pattern — three long bars, repeating every ~2.4 s until acknowledged: ripples + small shake; haptic `Alkyone.vibrate([400,160,400,160,400,1200])` repeating) · `lost` (user presses "Simulate lost signal": heartbeat pings stop, link goes dashed/grey, a row of 3 beat slots empties one by one on the missed-beat schedule; after the third missed beat → `alert-lost`: attention pattern + text "No heartbeat from the patch. Silence is treated as an alert.") · `ack` (tap/Enter/Space on the ring, or "Acknowledge" affordance: vibration stops with a settle, an acknowledgement pulse travels BACK ring→patch along the link, text "Acknowledged. The patch and the app are told.", returns to idle after ~2.5 s; if signal is still lost, button reads "Restore signal"). Segmented control Routine / Needs attention is a real radiogroup. The pattern strip visualizes the active pattern with a playhead. Everything labelled `.sim-tag`. Under reduced motion: no shake, no continuous ping; pulse travel is replaced by sequential node highlights (patch → link segments → ring), buzz by a glow + pattern-strip steps.
The ring is a ≥ 56px tap target with an accessible name that changes with state ("Ring. Tap to acknowledge the alert." / "Ring. Linked.").

### 6.5 App (owner: app agent)
Theme `mist-teal`. Realistic phone mockup in HTML/CSS only: ~300×620 at desktop (scales down to fit ≥ 320px viewports), bezel, side buttons, camera punch-hole or island (generic, not Apple-branded), status bar with a neutral time (e.g. "02:14"), home indicator, subtle glass reflection, layered shadow. On scroll-in it tilts upright via `--p` (rotateX ≈ 10° → 0, small rise). Four screens in a horizontal scroll-snap track (swipe / drag on desktop / tab bar buttons / ←→ keys on the tablist); page dots or tab underline follows. Each screen carries a `.sim-tag`.
1 **Live**: patch status ("Patch linked · skin contact" simulated), heart rate in large serif numerals with a scrolling pulse waveform (canvas/SVG), SpO<sub>2</sub> and skin temperature tiles, position chip ("On back"), alert state "No alerts" (warm only when an alert exists). Values drift gently every ~1 s while visible (static under reduced motion). NO normal ranges, NO colored "good/bad" judgements.
2 **Sleep** ("Tonight so far"): compact overview strip (asleep/awake blocks) + vertical timeline merging SENSOR events (asleep/awake, position changes, movement, alerts — tag "Sensor", patch icon) with MANUAL entries (tag "You", hand icon). Sorted by time. No sleep staging (that is future work).
3 **Alerts**: simulated history list: time, type (Routine / Needs attention / Signal lost), "Acknowledged" time. Warm accent only for needs-attention/signal-lost rows. No response-time statistics.
4 **Log**: big tiles Feeding · Diaper change · Sleep start · Sleep stop · Medication · Note. Tapping opens an inline form: time (`<input type=time>` prefilled with the simulated "now"), optional free text, "Add" and "Cancel". Adding appends to shared state, re-renders the timeline immediately (new item highlights briefly; a toast "Added to the timeline"), and lists under "Recent entries" with a "Remove" control. Medication is a free-text note only: NO dosing logic, advice or drug names preloaded. Seed 3–4 manual entries so the timeline is rich from the start. State lives in memory (no storage). "Reset demo" link restores seeds.
Tab bar buttons ≥ 44px; swipe must not fight page scroll (`touch-action: pan-y` on the track; vertical scroll inside a screen only where needed with `overscroll-behavior: contain`).

### 6.6 Sleep position (owner: sleep agent)
Theme `night` with faint star field. Plate: abstract figure + mattress line + sensor dial + scrubber. The figure is a deliberately ABSTRACT, faceted torso-with-patch seen from the head end (or top-down) that rotates between three postures — back (0°), side (±90°), tummy (180°) — by easing to the simulated IMU roll angle; head is a neutral shape that does not turn; no limbs are animated; nothing implies a reconstructed body. Beside it a small "sensor dial" shows the simulated tilt angle with a gravity arrow (this teaches: one sensor → one angle → three postures). Pose label under the figure ("On back / On side / On tummy") with `aria-live` off (announce only on scrubber commit).
Simulated night: deterministic seeded data (e.g. 9 h at 1-min resolution, roll angle series with plausible-looking transitions, hysteresis for classification at 45°/135°), shown as a posture ribbon above the scrubber (color AND pattern/label, not color alone). Scrubber = native `<input type=range>` (keyboard-friendly, `aria-valuetext` "10:42 pm, on side") + Play/Pause (auto-advance ≈ 20 simulated minutes per second; steps instead of tween under reduced motion; never autoplays). Label EXACTLY "Exploratory visualization of simulated data" visible on the plate (use `.exp-tag` + `.sim-tag`), plus the limits note and the position line from the copy deck. No percentages-of-night statistics, no "quality score", no safety coloring.

### 6.7 Future + Team (owner: content agent)
**Future** (`mist`): six chips as `<button aria-expanded>` that expand in place (or into a shared detail panel) with the one-liner; each shows `.exp-tag` "Exploratory". Chip layout: confident, editorial (varied widths on desktop, wrap on phones), faint constellation hairlines in the background; no icons-in-circles grid. Keyboard operable; only one open at a time or all independently — your call, but accessible.
**Team** (`mist-teal`): three cards, asymmetric/offset rhythm on desktop, stacked on phones. Photo placeholder = arch-shaped frame with soft facet gradient + initials in serif + "Photo placeholder" micro-label (must be unmistakably a placeholder). Role lines per copy deck, glossary terms for ECE / sensor fusion. "Short bio to come."

## 7. QUALITY BAR

Mobile-first; verify at 360×640, 390×844, 412×915, 820×1180, 1440×900. No horizontal page scroll at any width ≥ 320. Tap targets ≥ 44×44 CSS px (inline glossary terms get padding/hit-area ≥ 24px tall). Visible `:focus-visible` rings on every control (2px, offset 3px, theme-aware). Semantic landmarks, one h1, headings in order, every control has an accessible name, live regions for simulation state changes, no keyboard traps, `prefers-reduced-motion` honored, no autoplay sound, no flashing > 3/s. Contrast per §2. `lang="en"`. No console errors or warnings in a normal run (the harness' "GPU stall due to ReadPixels" warning is a SwiftShader screenshot artifact — ignore it). Offline/CDN-blocked: the page remains fully usable with SVG fallbacks.
Performance: lazy-init heavy things on approach; pause everything off-screen; no layout thrash (batch reads/writes); `will-change` only while animating; keep the inline HTML reasonable (< ~600KB with fonts).

## 8. TEST PROTOCOL (do this, don't skip; LOOK at the PNGs)

```
# isolated dev page for one section
node BUILD/build.mjs --only ring --out BUILD/dev/ring.html
# screenshots (phone, scroll to the section top) + JSON report (console, overflow, tap targets, a11y lint, honesty-lint hits)
node HARNESS/shot.mjs BUILD/dev/ring.html --out SHOTS/ring --preset phone --at "#ring" --label ring
node HARNESS/shot.mjs BUILD/dev/ring.html --out SHOTS/ring --preset desktop --at "#ring" --label ring
# other modes: --reduced-motion  --block-three (CDN blocked => fallback)  --cpu 4 (mid-range phone)  --preset small|se|tiny|pixel|tablet|landscape|wide  --full
node HARNESS/axe.mjs BUILD/dev/ring.html --preset phone            # axe-core (WCAG 2.x A/AA + best-practice)
node HARNESS/keyboard.mjs BUILD/dev/ring.html --preset desktop     # Tab order, focus rings
node HARNESS/fps.mjs BUILD/dev/ring.html --preset phone --cpu 4    # frame pacing + main-thread cost while scrolling
```
For interactions write your own small Playwright script (import `launch, open, shot, swipe, pinch, scrollToSel, report` from `HARNESS/lib.mjs`; `launch({preset,reducedMotion,blockThree,cpu})` returns `{page,log,close}`) — click the buttons, swipe the carousel, wait, screenshot each state, and LOOK. Test every state of your section, in normal and reduced-motion modes.
Remember the harness renders WebGL with software SwiftShader: raw FPS is pessimistic; main-thread cost and long tasks are what matter.

## 9. WHAT YOU RETURN (structured result)

Your final message must be the structured object requested by the workflow: `summary`, `files` (absolute paths you created/changed), `decisions`, `claims` (EVERY factual statement you put on the page: `{text, basis}` where basis ∈ `brief | brief-derived | glossary | general-knowledge | design-intent | simulation | placeholder`), `testsRun`, `knownIssues` (be honest; do not hide problems), `foundationRequests`. Never claim you tested something you did not.

## 10. SKILLS you may load with the Skill tool if useful
`modern-web-design`, `animation-performance`, `animate`, `choreograph`, `apple-design` (gestures/phone), `emil-design-eng` (polish), `web3d-integration-patterns`, `lightweight-3d-effects` (only for ideas; we use plain Three.js r160 + SVG). Skim, don't over-read.
