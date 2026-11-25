# Alkyone concept page: handoff

Status: **complete build. `my-site/index.html` exists** (single file, about 611 KB with fonts, 3D from the Three.js CDN with an SVG fallback). Rebuild with `cd alkyone-build && node build.mjs`, then copy `dist/index.html` to `my-site/index.html`.

Scenes in order: hero, **loop (new: "The system", the closed loop)**, patch, ring, app, sleep, future, team, footer. The nav and footer now use the supplied logo (a recolourable mask in `src/parts/logo-mask.*`, embedded in `base.css`). The rail has 8 stars.

Added in the last session: logo, loop scene, ring (SVG scene, state machine, simulated BLE pulse, patterns, lost signal, acknowledge), app script (tabs, swipe, Log form, merged timeline, live trace), sleep script (seeded night, scrubber, posture figure on canvas, dial), app build warning fixed, future and team reviewed (copy deck verbatim). Tests: `dev/ring-interact.mjs`, `dev/app-interact.mjs`, `dev/sleep-interact.mjs`. Full page: axe 0 violations (phone and desktop), 0 console errors, no horizontal scroll from 320 px, honesty word scan clean (only the footer disclaimer hits). Software GL only; nothing tested on a real phone.

Honesty notes: "global" and "does everything" are NOT claimed anywhere (no basis). ML, predictive maintenance, second-caregiver escalation are tagged Exploratory. Loop fallbacks use only brief-derived behaviour (silence is an alert, wear detection tells you, alert repeats until acknowledged). Authored strings to give a final read: loop copy (lede, four "break a step" cases, card text), ring status "No heartbeat yet. Counting the missed beats." and "Acknowledged. Still no heartbeat from the patch.", app seed entries and sensor event names, sleep dial wording.

Remaining: real-phone test, final read of authored strings, real team photos and bios, real contact address.

## Where things are

| Path | What |
|---|---|
| `alkyone-build/CONTRACT.md` | Binding spec: brief, honesty rules, design plan, architecture, copy deck, scene specs, test protocol. **Read first.** Its section 0 paths point at the old scratchpad; use the paths below instead. |
| `alkyone-build/FOUNDATION.md` | Authoritative API, classes, tokens and the scene authoring skeleton. |
| `alkyone-build/INFANT.md` | API for the hero 3D module (model, Three.js scene, SVG fallbacks). |
| `alkyone-build/build.mjs` | Assembler. `node build.mjs` writes `dist/index.html`; `--only hero,patch --out dev/x.html` builds a partial page. Its validator rejects external URLs other than the Three.js CDNs. |
| `alkyone-build/src/` | `template.html`, `base.css`, `core.js` (window.Alkyone runtime), `fonts.css`, `sections/<id>/section.{html,css,js}`, `sections/shared/` (infant model, scene, `viewer.js`, generated SVG fallbacks in `gen/`). |
| `alkyone-build/harness/` | Playwright scripts (shot, axe, keyboard, fps, lib). `node_modules` is installed. Paths: `node harness/shot.mjs dev/hero-patch.html --out shots/patch --preset phone --at "#patch"`. |
| `alkyone-build/dev/hero-patch.html` | Current hero + patch preview page (other scenes are placeholders). Rebuild: `node build.mjs --only hero,patch --out dev/hero-patch.html`. |
| `alkyone-build/dev/patch-interact.mjs`, `patch-life.mjs`, `patch-cost.mjs`, `hero-metrics.mjs` | Test scripts written for hero and patch (see "Tests run"). Run from `alkyone-build/`. |
| `alkyone-build/shots/` | Screenshots from the hero and patch work. |
| `alkyone-build/w2a-sections.js`, `w2b-3d-sections.js`, `w3-integrate-qa.js` | Old workflow scripts, stopped on request. W3 was never run. |
| `alkyone-build/spike-A/`, `spike-B/` | 3D variant prototypes (`spike-B` lost). Not needed for the build. |

## Done

- **Foundation**: assembler, fonts, tokens and themes (mist, mist-teal, night), nav with concept-stage pill, seven-star rail, footer, runtime (lazy scenes, glossary, reveal, `loadThree()`).
- **Hero 3D model**: sculpted-rings variant; shared modules and generated SVG fallbacks in `src/sections/shared/`.
- **Hero** (`src/sections/hero/`):
  - The build warning is fixed (the call is now literally `window.Alkyone.section('hero', ...)`).
  - On phones the stage flexes so copy, figure, notice chip and scroll cue fit one screen from 320x568 up to tablets. The cue is 44px wide.
  - Short landscape phones get a two-column layout and a smaller headline.
  - The headline is 3 lines at 390px.
- **Patch** (`src/sections/patch/`, new):
  - Night plate with the 3D viewer. The inline patch SVG is the first view and the no-WebGL view; 3D cross-fades over it.
  - Five numbered hotspot dots on the figure. They follow the 3D parts, hide when facing away or at the edge, and spread apart with a hairline leader when parts are close.
  - The same five parts are a list under the header (the keyboard and touch path), plus a detail card with glossary terms (`optical`, `spo2`, `imu`, `ondevice`).
  - Selecting a part eases the camera to that part, draws the warm ring in 3D and opens the card. Selecting it again puts it away.
  - Viewer controls: turn, tilt, zoom, reset (44px buttons). Also drag, pinch, Ctrl + wheel and keyboard (arrows, + / - / 0) on the focused viewer.
  - The camera dollies chest to patch with scroll until the visitor takes over.
  - No WebGL: SVG with the same dots, zoom and drag-to-move; the turn and tilt buttons are left out and the helper text changes.
  - Reduced motion: still camera, no loops, instant moves.
  - The WebGL context is released when far away and rebuilt on return (the chosen part survives). Context loss falls back to the SVG and recovers.
  - Built when the browser is idle, not during hero paint.

## Tests run (hero + patch only)

All on headless Chrome with software WebGL (SwiftShader). Nothing was run on a real phone.

- Layout at 320x568, 360x640, 375x667, 390x844, 412x915, 820x1180, 844x390 and 1440x900: no horizontal scroll, no overflow offenders, no duplicate ids.
- axe (WCAG A/AA + best-practice): 0 violations on phone and desktop (one "incomplete": contrast over the hero's gradient could not be measured).
- Console: 0 errors in a normal run. With the CDN blocked, the browser logs two failed-request errors (expected); the page still works.
- Keyboard walk: viewer, then its controls, then the parts list; a visible ring on every stop (the viewer's ring is an overlay).
- Interactions: part by list and by dot, orbit by drag and buttons, zoom, reset, keys, normal / reduced motion / CDN blocked. Both the scroll-away-and-back rebuild and the simulated context loss.
- Frame pacing at 4x CPU throttle while scrolling the hero + patch page: median 16.7 ms, p95 about 33 ms, no layout shift. The scene build itself costs one frame of roughly 270 ms at 4x on software GL.
- Cost fix found on the way: a star field made of 11 full-size gradient layers plus a mask made one DPR-3 screenshot take 15 s. It is now 11 tiny tiles with no mask (about 1 s).

## Not done

| Scene | State |
|---|---|
| ring | Only `hand.svg.html`, `chest.svg.html`, `gen-hand.mjs`, `preview.html`. Missing `section.html`, `section.css`, `section.js` (state machine, BLE pulse, patterns, lost signal, acknowledge). |
| app | html, css; missing `section.js` (carousel, tabs, Log form, timeline merge). Build warning: `section.css:237` selector `#app-picker[hidden]` must start with `#app` or `.app-`. |
| sleep | html, css, `stars.svg.html`; missing `section.js`. |
| future, team | html, css, js written, never reviewed against the honesty rules. |

## Next steps

1. Finish `ring`, `app`, `sleep` per `CONTRACT.md` sections 6.4 to 6.6, using the `build.mjs --only` loop and the harness commands in section 8 (paths as in the table above).
2. Fix the `app` build warning.
3. Review `future` and `team` against the honesty rules.
4. Integration pass on the full page: console clean, no duplicate SVG ids across scenes, no horizontal scroll at 320 to 412 px, tab order, reduced motion, CDN blocked, at most 2 live WebGL contexts.
5. Honesty review of every visible string against `CONTRACT.md` section 1 (every simulated view tagged "Simulated data"; the sleep scene's exact label "Exploratory visualization of simulated data").
6. `node build.mjs`, then copy `dist/index.html` to `my-site/index.html` (not done yet on purpose: the page is not complete).
7. Test on a real phone (WebGL ran on software rendering, so there are no real-GPU numbers).

## Hero and patch: statements to give a final read

Patch hotspot titles and texts, the caption "Fig. 1 - Illustration, not to scale." and the hero copy are verbatim from the copy deck. These strings are **authored here and not in the brief**:

- Patch helper line, four wordings: "Drag to turn. Pinch to zoom." / "Drag to turn. Hold Ctrl and scroll to zoom." / "Pinch to zoom, then drag to move." / "Hold Ctrl and scroll to zoom, then drag to move." (The copy deck says "Pinch or scroll to zoom"; plain scroll is not used so the page never traps scrolling.) Plus a screen-reader sentence about arrow keys, plus / minus and 0.
- Patch detail card, empty state: "Nothing selected yet. Tap a dot on the patch, or pick a part from the list."
- Patch screen-reader description: "An illustration of the patch: a small, rounded pad with five parts. Pick a part from the list below to read what it does."
- Hero screen-reader description: "An illustration of a stylized infant torso with a small flexible patch on the chest, glowing softly in amber."
- Control names: Turn left / Turn right / Tilt up / Tilt down / Zoom in / Zoom out / Reset view; viewer name "The patch, shown large" ("3D viewer").
- Hero caption (small, beside the figure): "Illustration, not to scale." (from the figure-caption convention in the contract, not the copy deck).
- Design intent shown in the artwork, with no text claim: the patch parts are drawn as if seen through a translucent cover; the warm accent marks hotspots and the patch pulse; the infant torso is a faceless, stylized low-poly illustration (it can read a little like a padded top, so both scenes caption it "Illustration, not to scale").
- The footer and the nav pill are foundation-owned; the honesty lint flags only the footer disclaimer ("clinical", "prevent", "SIDS", "diagnose"), which is intended wording.

## Update: hero photo + scroll zoom, team, footer

- Hero (`alkyone-build/src/sections/hero/`): the 3D torso is gone. The hero shows the supplied plush-toy photo (cut out, inline WebP in `photo.img.html`) with the patch drawn on its chest. The section is a 400svh scroll track with a sticky pin: scrolling zooms into the patch, the photo cross-fades into a drawing of the flexible circuit, then six numbered steps (Monitoring, Processing on the device, Machine learning [exploratory], Predictive maintenance [exploratory], The link, Fallback routes) highlight one at a time. Reduced motion or no JS: no pin, the drawing and the six steps are shown as a normal block under the hero. Caption says a plush toy stands in for the baby.
- Rights note: the photo looks like a retail product shot. Confirm you may publish it (or swap `photo.img.html`).
- Team: real bios from the pasted text (verbatim apart from dropping the repeated name), plus the "what happens next" line. Photos are not supplied, so each card has a monogram (ED, EG, AR) on a faceted arch, no "placeholder" label. Drop real photos in later.
- Footer: the placeholder contact address was removed (no real address was given). Add one when you have it.
- Tests: `dev/hero-scroll.mjs desktop|phone [reduced] [q list]`, `dev/hero-rects.mjs`. axe 0 violations, 0 console errors, no horizontal scroll.

## Update: 3D baby in sleep scene, round team portraits, GitHub Pages
- Sleep scene: low-poly baby on a mattress (canvas 3D projection, `src/sections/sleep/section.js`). It rolls back / side / tummy with the scrubber; the amber patch is on the chest and turns dashed when it faces away.
- Team portraits are circles. `.gitignore` keeps only index.html, build source (`alkyone-build/src`, `build.mjs`, `harness`, docs). `.nojekyll` added for Pages.
- Rebuild: `cd alkyone-build && node build.mjs && cp dist/index.html ../index.html`

## Update: new photo, smoother hero scroll, "See how it works", real 3D sleep baby
- Hero photo replaced (clean cut-out, no smudge). Regenerate with `python alkyone-build/dev/make_photo.py` (reads the source image path at the top of the script). Rights note above still applies.
- Hero scroll is now eased: `section.js` reads the scroll position once per frame and runs it through two soft stages before drawing (about 0.1 s each), in both directions. It snaps (no easing) on first draw, resize and when the pin is switched off.
- "See how it works" button in the hero copy (`#hero-how`, `href="#hero-zoom"` so it still works without JS). With the pin on, it scrolls by itself with an ease-in-out (1.4 to 2.8 s depending on distance) and lands at q = 0.458 of the track, where the circuit is fully grown and card 1 of 6 is fully in. The target is recomputed every frame and the last frame is an exact `scrollTo`, so it cannot stop short or overshoot. Wheel, touch, key or pointer press cancels it. Reduced motion or no pin: it just jumps to the static drawing. Test: `node dev/hero-how.mjs desktop|phone|landscape [reduced]`.
- Sleep scene: the canvas-2D low-poly baby is now only the fallback (no WebGL, Three.js failed to load, or context lost). With WebGL it is a Three.js scene in `src/sections/shared/sleep-baby.js` (smooth sculpted baby in a sleepsuit, posture-dependent arms, legs and head, quilted flat mattress, soft shadows, amber patch with glow and a normal arrow that stays faintly visible when the patch faces away). No pillow, blanket or breathing motion. The label "Exploratory visualization of simulated data" is unchanged.
- Slower and smoother: posture follows the timeline through two soft stages (about 0.3 s each), Play runs at 10 simulated minutes per second (was 20), reduced motion steps without easing. Pose lab: `node dev/baby-lab.mjs 0,90,180,-90 760x600` writes `shots/baby/*.png`. Timing check: `node dev/sleep-smooth.mjs desktop|phone [reduced]`.
- Other: SpO2 glossary button now meets the 24 px target size; the static step titles in the no-JS/reduced-motion list are paragraphs, not h3 (heading order). axe: 0 violations on desktop, phone and reduced motion. Size is about 674 KB (soft budget 600 KB); most of it is the inline photo and the 3D code.
- Never tested on a real phone or a real GPU (software GL only). Check the sleep scene and the hero scroll on a real phone before publishing.
