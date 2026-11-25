# INFANT.md - the infant torso + patch module (hero, patch viewer)

Winner of the two-variant round: **A ("sculpted rings")**, refined and with ideas grafted from B.
Files (all under `build/src/sections/shared/`):

| File | What |
|---|---|
| `infant-model.js` | PURE geometry (no THREE, no DOM). Works in the browser (`Alkyone.infant.model`) and in Node (`require`). Deterministic. |
| `infant-scene.js` | Three.js r160 scene builder (`Alkyone.infant.scene.create`). Needs `infant-model.js` first (lexical order does this). |
| `gen/gen-fallback.mjs` | Node generator. Run `node gen/gen-fallback.mjs` after ANY change to the model. Writes the files below and refreshes `build/dev/infant-proto.html`. |
| `gen/hero-fallback.svg.html` | Inline SVG fallback, hero 3/4 camera, mist lighting (~75 KB). |
| `gen/hero-fallback.night.svg.html` | Same, night lighting + facet hairlines (own scoped `<style>`). Optional (~75 KB), only include if a night torso is used. |
| `gen/patch-fallback.svg.html` | Large front view of the patch (~23 KB), for the patch section without WebGL. |
| `gen/patch-hotspots.json` | The five hotspot anchors as fractions (0..1) of the patch SVG viewBox. |
| `../../../dev/infant-proto.html` | Kept test page working with the shared files (see "Proto page"). |

Both JS files use the same namespace shim as the rest of the page: `window.Alkyone = window.Alkyone || {}` (falls back to `globalThis` in Node), so they work standalone and after `core.js`. No console output, no `eval`, no external requests.

## 1. API

```js
const THREE = await Alkyone.loadThree();            // null on failure: keep the SVG
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, Alkyone.lowPower ? 1.5 : 2));

const S = Alkyone.infant.scene.create(THREE, {
  backdrop: 'mist',                                  // 'mist' | 'night'
  quality:  Alkyone.lowPower ? 'low' : 'high'        // 'low': 512px art textures, no rim shader, no night hairlines
});
// S = { scene, camera, root, anchors, frames, setTime, setHighlight, setBackdrop, resize, dispose,
//       applyFrame, orbitFrame, cutLines, maskGradient, stats, model, backdrop }
```

| Member | Meaning |
|---|---|
| `scene`, `camera` | Render with `renderer.render(S.scene, S.camera)`. Camera is a PerspectiveCamera; the scene sets position, lookAt and fov through `applyFrame`. |
| `root` | A Group you may rotate/scale freely (yaw sway, scroll yaw, orbit). A child group carries the barely-there breathing (<= 0.55 %). |
| `anchors` | `{optical, temp, imu, mic, wear}: {position: Vector3, normal: Vector3}` in **root-local** space, on top of the patch lid. |
| `frames` | Camera frames `{hero, heroFill, chest, patch, component:{optical,temp,imu,mic,wear}}`, each `{position: Vector3, target: Vector3, fov}` (vertical fov, degrees). Recomputed in place by `resize()`, so keep references. |
| `setTime(seconds)` | The ONLY driver of motion (breathing + warm core pulse every 1.6 s + highlight wobble). Fixed t = fixed picture. Reduced motion: call once with a constant and render once. |
| `setHighlight(id\|null, amount01)` | Warm ring + soft bloom around one component (`optical`, `temp`, `imu`, `mic`, `wear`). Hides itself when the patch faces away. Animate `amount01` 0..1 for a ring that grows in. |
| `setBackdrop('mist'\|'night')` | Lights, rim, halo, core gain and the night-only facet hairlines. Cheap; hairline geometry is built lazily the first time night is used (high quality only). |
| `resize(w, h)` | Updates aspect and the aspect-dependent frames. Call from a ResizeObserver, after `renderer.setSize(w, h, false)`. Re-applies the active frame. |
| `applyFrame(frame)` | Copies a frame onto the camera (and remembers it for `resize`). |
| `orbitFrame(azDeg, elDeg, margin?)` | A fresh frame orbiting the whole figure (0 az = front, +90 = infant's left side), fitted to the viewport. Use for quick views/tests. |
| `cutLines(frame?)` | `{top, bottom}` fractions (0..1) of the stage height where the planar neck/hip cuts land. |
| `maskGradient(frame?, {top, bottom})` | CSS `linear-gradient(...)` string that dissolves the cuts (eased, long ramps; see 4). |
| `dispose()` | Disposes geometries, materials, textures, removes lights. The caller owns the renderer/canvas (`renderer.dispose()`, `canvas.remove()`). |
| `stats` | `{triangles, meshes, drawCallsRendered, drawCallsMax, textures, quality, rim, edges}`. |

Model API (pure): `Alkyone.infant.model.build(opts?) -> {parts, patch, bounds, stats}`, `frames(built, aspect)`, `cutLines(built, frame)`, `maskGradient(cut, opts)`, `fitFrame`, `orbitDir`, `viewBasis`, `rig` (light rig per backdrop, shared by 3D and SVG), `shade(...)` (CPU Lambert + rim, same maths as the scene), `patchPoint`, `layout`, `util`. `build({seed})` changes only the hand-sculpt wobble; same seed gives byte-identical output.

## 2. Suggested camera frames and how to use them

| Frame | Use | Notes (aspect 0.8) |
|---|---|---|
| `frames.hero` | Hero, first paint. | 3/4 view (az 31, el 8), ONE camera position; fov = 23.3 deg at aspect >= 0.8 and widens for narrower stages, which is exactly CSS `contain`, so the canvas and the SVG fallback (`preserveAspectRatio="xMidYMid meet"` on an 800x1000 viewBox) frame the figure identically at every aspect. |
| `frames.heroFill` | Fits the real aspect (tighter on wide stages). Use on desktop if the figure should be bigger than the 4:5 reference. The SVG fallback is not matched to it. |
| `frames.chest` | Patch viewer start. Upper chest, fov 34. Dolly from here to `frames.patch` for scroll progress 0.2 -> 0.55. |
| `frames.patch` | The patch, slightly off-axis (fov 32). |
| `frames.component[id]` | Close framing for a hotspot. fov follows the aspect so the ring takes about half of the limiting dimension. At aspect 0.8: optical 37, temp 23, imu 42, mic 23, wear 52. |

Interpolating frames: lerp `position`, `target` and `fov`, then `applyFrame` (or set camera directly and `camera.updateProjectionMatrix()`):

```js
function blend(a, b, t, out) {                       // t: 0..1 eased
  out.position.lerpVectors(a.position, b.position, t);
  out.target.lerpVectors(a.target, b.target, t);
  out.fov = a.fov + (b.fov - a.fov) * t;
  S.applyFrame(out);
}
```

Orbit controls (the patch viewer): keep the frame's `target`, rotate the offset `position - target` about Y (yaw) and about the camera right axis (pitch), clamp pitch +-35 deg and yaw +-70 deg around the frame, damp with `x += (goal - x) * (1 - Math.exp(-dt * 8))`, and zoom by scaling the offset length (0.6x .. 1.6x). Alternatively rotate `S.root` for the hero sway (`S.root.rotation.y = 0.12 * Math.sin(t / 5000) + scrollYaw`). The halo on the chest fades out automatically when the camera is within ~1 unit of the patch.

## 3. Projecting anchors to 2D (hotspot buttons)

```js
const v = new THREE.Vector3();
function project(id, w, h) {
  S.root.updateWorldMatrix(true, true);
  v.copy(S.anchors[id].position);
  S.root.children[0].localToWorld(v);                // the 'breath' child group is where anchors live
  const behind = S.camera.position.clone().sub(v).normalize()
        .dot(S.anchors[id].normal.clone().transformDirection(S.root.children[0].matrixWorld)) < 0.08;
  v.project(S.camera);
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, hidden: behind || v.z > 1 };
}
```

Call once per frame after `setTime`; write `transform: translate(x px, y px)` on the buttons; hide with `opacity` + `pointer-events: none` when `hidden`. For the ring radius in CSS pixels use `model.layout[id].radii[0] * patch.halfWidth` projected at the anchor, or simply scale by `1 / camera distance`.

SVG fallback: `gen/patch-hotspots.json` gives `{x, y, rx, ry}` as fractions of the 800x1000 viewBox for `optical, temp, imu, mic, wear`. The SVG is letterboxed (`meet`): scale `s = min(w/800, h/1000)`, offset `ox = (w - 800 s)/2`, `oy = (h - 1000 s)/2`, then `px = ox + x*800*s`, `py = oy + y*1000*s`, radii `rx*800*s`, `ry*1000*s`. (`infant-proto.html` has a working `hotspotOverlay`.)

## 4. Hiding the neck and hip cuts

The torso is cut by two planes (neck, hip). Never show them hard. Use the mask:

```js
function layout() {
  S.resize(w, h); S.applyFrame(S.frames.hero);
  const g = S.maskGradient(S.frames.hero);          // eased ramps: 21 % of the figure at the neck, 17 % at the hem
  stage.style.webkitMaskImage = stage.style.maskImage = g;
}
```

For the SVG fallback the same fractions are on the root `<svg class="hero-fallback">` as `data-cut-top` / `data-cut-bottom` (fractions of the 1000-unit viewBox height). Convert for `meet` letterboxing: `dh = 1000 * min(w/800, h/1000)`, `oy = (h - dh)/2`, `top = (oy + dataCutTop * dh) / h` (same for bottom), then `Alkyone.infant.model.maskGradient({top, bottom})`. Because the canvas and the SVG share one camera, the two masks coincide and the cross-fade has no jump. Do not mask the patch viewer (patch/component frames do not show the cuts).

## 5. Fallback SVG classes (for CSS)

Hero SVG: `<svg class="hero-fallback">` (night variant adds `hero-fallback--night`)
- `.fb-body`: groups of facet polygons (far arm + torso; near arm). No animation.
- `.fb-patch`: the whole patch. Inside it `.fb-glow` (warm halo ellipse), `.fb-tray`, `.fb-ghost`, `.fb-pulse` (amber flex core), `.fb-lid` (frosted cover with sheen).
- Add the CSS-only pulse (the 3D scene pulses once per 1.6 s):
```css
.fb-pulse { animation: fbPulse 1.6s ease-in-out infinite }
.fb-glow  { animation: fbGlow  1.6s ease-in-out infinite }
@keyframes fbPulse { 0%,100% { opacity: .84 } 26% { opacity: 1 } }
@keyframes fbGlow  { 0%,100% { opacity: .5  } 26% { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .fb-pulse, .fb-glow { animation: none } }
```
Pause with `animation-play-state: paused` when the section is off-screen.
Patch SVG: `<svg class="patch-fallback">` with `.fb-glow`, `.fb-body` (tray), `.fb-ghost` (wear pads), `.fb-pulse` (amber core, all components), `.fb-lid`. Same keyframes apply. The five hotspots are NOT in the SVG; draw buttons from `patch-hotspots.json`.
Cross-fade: the SVG is in the HTML and visible at once; when the canvas has rendered its first frame fade the SVG out (`opacity 0`, 0.8 s) and the canvas in. If Three or WebGL fails or times out keep the SVG.

## 6. Performance notes (measured)

- Triangles: model 2104 body+patch parts; scene 2286 including highlight ring and bloom quad (renderer reports ~2044 drawn on mist). Budget 3000: ~700 free.
- Draw calls: 7 rendered (8 on night with the hairlines; 10 max with a highlight showing). Budget 25. Shader programs: 3 on mist, 4 on night (the extra one is `LineBasicMaterial`). 5 canvas textures (3 art 1024^2 at `high`, glow 256, halo 192), no texture files, no shadows, no post-processing.
- Measured with `--cpu 4` on SwiftShader (pessimistic): `scene.create` about 125-131 ms, first render about 77-125 ms. Model build in Node about 20 ms. Steady frame cost under 1 ms (A variant's benchmark).
- Night hairlines: `EdgesGeometry` of the body, 656 segments, built lazily on the first `setBackdrop('night')` and only at `quality:'high'`.
- Pause the rAF loop when the section is off-screen or the tab is hidden (`Alkyone.raf` does the second). Cap pixel ratio at 2 (1.5 on `lowPower`). One WebGL context per 3D plate; contract allows 2.
- Context loss: the scene builder does not own the renderer, so the PAGE must handle it. On `webglcontextlost` call `preventDefault()` and stop the loop; on `webglcontextrestored` restart (CanvasTextures re-upload by themselves in r160); if no restore within about 3 s show the SVG again.
- Reduced motion: `setTime(0.42)` (core at its soft peak), render once on demand, no sway. User-driven orbit still allowed.
- The 3D (and its CanvasTextures) are created lazily: do all of it inside the section `init` (fired about one viewport before the section is visible).

## 7. Visual design as shipped

- Body: lofted from 15 rings x 14 segments on a half-segment-staggered lattice (brick-laid triangles, no horizontal quilting bands), tapered hip, short neck, sloped shoulders, two chubby arm stubs with rounded ends. One flat tint per facet from a porcelain-to-teal ramp (whiter top, saturated blue-teal underside). No skin tones, faceless.
- Light: key (front-left, high), cool fill, rim from behind, hemisphere. One definition (`model.rig`) drives both the three.js lights and the CPU shading of the SVG fallbacks.
- Night: stronger key, luminous teal fresnel edge, faint facet hairlines (alpha 0.17), stronger halo.
- Patch (0.44 x 0.37 units, about 24 % of the torso width): pale rounded tray, frosted translucent lid with bevel, long glass sheen and specular dot; beneath it an amber flex core with serpentine traces, optical disc (a vertical column of two square emitters and a photodiode, deliberately not a face), IMU chip with leg pins on a warm pad, temperature bead, perforated microphone disc and dashed wear-contact pads. A tiny four-point star (the Alkyone mark) is embossed in the lid.
- Warm accent only on the patch core, the chest halo and the highlight ring.

## 8. Proto page

`build/dev/infant-proto.html` loads the shared files directly (`../src/sections/shared/*.js`) and has the generated fallbacks inlined. No parameters gives a gallery. Parameters: `?view=front|three-quarter|left|right|side|top|back|chest|patch|optical|temp|imu|mic|wear`, `&theme=mist|night`, `&still=1` (render one frame), `&fallback=1` (SVG only), `&mask=0`, `&q=low`, `&az=&el=`, `&hl=0`, `&hud=1`. It exposes `window.__S` (scene) and `window.__R` (renderer) for debugging. Re-run `node src/sections/shared/gen/gen-fallback.mjs` to refresh its inline SVG after editing the model.

## 9. Known limitations

- The body is deliberately a stylized, slightly puffy infant torso; with the arms it can still read a little like a padded top. It is faceless and has no skin tones; it is not anatomically accurate and must be captioned "Illustration, not to scale".
- One facet on the right chest is noticeably darker than its neighbors on night at the hero 3/4 angle (a facet facing away from all lights). It is a legitimate low-poly shading outcome, not a hole (verified double-sided render), but it is the most "glitch-looking" spot. A small light tweak would hide it.
- The SVG hero fallback is about 75 KB (night about 75 KB more if used). Arm/torso intersection is now accurate to about 1.5 px at 800 px (subdivision depth 5) but the SVG has no rim fresnel, so edges look slightly flatter than the 3D.
- Night hero fallback hairlines are 0.5 px strokes on every facet; they are subtle but can add a faint "mesh" look at small sizes.
- The cut mask is a CSS mask: the page must apply it, and `maskGradient` is only exact for the frame it was computed for (recompute on resize and when you change frames; for orbit views that show the cuts, do not use the mask or recompute per frame).
- Component frames are tuned for fov 16..52 and for a viewer plate about as wide as tall; very tall narrow plates can crop the wear pads in the `wear` close-up.
- No contextlost handling inside the scene (see 6). No hotspot/orbit code: that is the next engineer's job.
- Performance numbers are from SwiftShader in headless Chrome; no real mid-range phone was available.
