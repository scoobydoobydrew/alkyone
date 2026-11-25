/* ============================================================================
   Alkyone · infant-scene.js            variant A — "sculpted rings"
   ----------------------------------------------------------------------------
   Three.js r160 builder for the infant torso + flexible-circuit patch.
   Requires infant-model.js first (window.Alkyone.infant.model).

   Alkyone.infant.scene.create(THREE, { backdrop:'mist'|'night', quality:'high'|'low' }) returns
     scene, camera, root              root is the Group the page may rotate/scale freely;
                                      a child group carries the (barely-there) breathing.
     anchors  {optical,temp,imu,mic,wear: {position:Vector3, normal:Vector3}}   root-local
     frames   {hero, chest, patch, component:{optical,temp,imu,mic,wear}}  each {position,target,fov}
                                      Vector3 + vertical fov (deg). Recomputed in place by resize().
     setTime(seconds)                 ONLY driver of motion: breathing (<= 0.6 % scale) and the warm core
                                      pulse (one soft pulse per 1.6 s). Fixed t = fixed picture.
     setHighlight(id|null, amount01)  warm ring + soft glow on one component
     setBackdrop('mist'|'night')      lights, rim and glow adapt
     resize(w, h)                     aspect, hero/component fov
     dispose()
   Extras: applyFrame(frame), orbitFrame(azDeg, elDeg), stats, info, model

   Budget: <= 3000 triangles, <= 25 draw calls (10 are rendered at once), transparent canvas,
   no texture files (CanvasTextures drawn in code), no shadow maps, no post-processing,
   no transmission, no env maps. Renderer settings: antialias + alpha, default tone mapping,
   outputColorSpace = SRGBColorSpace, setClearColor(0, 0).
   ========================================================================== */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.Alkyone = root.Alkyone || {};
  root.Alkyone.infant = root.Alkyone.infant || {};

  var PI = Math.PI, TAU = PI * 2;
  var BREATH_PERIOD = 6.0, PULSE_PERIOD = 1.6;

  function sstep(e0, e1, x) { var t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  function pulseAt(t) {                     // 0..1, soft rise then a slow fall, once per PULSE_PERIOD
    var ph = (((t % PULSE_PERIOD) + PULSE_PERIOD) % PULSE_PERIOD) / PULSE_PERIOD;
    return ph < 0.26 ? sstep(0, 0.26, ph) : 1 - sstep(0.26, 1.0, ph);
  }

  /* ----------------------------------------------- paint the shared art ops */
  function rgba(h, a) {
    h = h.charAt(0) === '#' ? h.slice(1) : h;
    return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' + parseInt(h.substr(4, 2), 16) + ',' + (a == null ? 1 : a) + ')';
  }
  function paintOf(ctx, p) {
    if (typeof p === 'string') return p;
    var g = p.g === 'radial' ? ctx.createRadialGradient(p.c[0], p.c[1], 0, p.c[0], p.c[1], p.r)
                             : ctx.createLinearGradient(p.p0[0], p.p0[1], p.p1[0], p.p1[1]);
    p.stops.forEach(function (s) { g.addColorStop(s[0], s[2] != null ? rgba(s[1], s[2]) : s[1]); });
    return g;
  }
  function polyPath(ctx, pts, close) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
  }
  function paintOps(ctx, ops) {
    ops.forEach(function (op) {
      ctx.save();
      ctx.globalAlpha = op.alpha != null ? op.alpha : 1;
      ctx.lineCap = op.cap || 'butt';
      ctx.lineJoin = op.join || 'miter';
      ctx.setLineDash(op.dash || []);
      ctx.beginPath();
      if (op.t === 'circle') ctx.arc(op.c[0], op.c[1], op.r, 0, TAU);
      else if (op.t === 'rrect') {
        var x = op.c[0] - op.w / 2, y = op.c[1] - op.h / 2, w = op.w, h = op.h, r = Math.min(op.r, w / 2, h / 2);
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
      } else {
        polyPath(ctx, op.pts, op.closed || !!op.holes);
        if (op.holes) op.holes.forEach(function (hl) { polyPath(ctx, hl, true); });
      }
      if (op.fill) { ctx.fillStyle = paintOf(ctx, op.fill); ctx.fill(op.holes ? 'evenodd' : 'nonzero'); }
      if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = op.sw; ctx.stroke(); }
      ctx.restore();
    });
  }

  /* ---------------------------------------------------------------- create */
  function create(THREE, opts) {
    opts = opts || {};
    var model = root.Alkyone.infant.model;
    if (!model) throw new Error('infant-model.js must be loaded before infant-scene.js');
    var quality = opts.quality === 'low' ? 'low' : 'high';
    var backdrop = opts.backdrop === 'night' ? 'night' : 'mist';
    var built = model.build(opts.model);
    var patch = built.patch, art = patch.art, A = art.A;
    var texSize = quality === 'low' ? 512 : 1024;
    var useRim = quality === 'high';
    var disposables = [];
    function track(o) { disposables.push(o); return o; }
    function V3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
    var rootG = new THREE.Group(); rootG.name = 'alkyone-infant';
    var breath = new THREE.Group(); breath.name = 'breath';
    rootG.add(breath); scene.add(rootG);

    /* ---- geometry helpers */
    function mergeParts(ids) {
      var list = built.parts.filter(function (p) { return ids.indexOf(p.id) >= 0; }), n = 0, o = 0, i;
      list.forEach(function (p) { n += p.positions.length; });
      var pos = new Float32Array(n), col = new Float32Array(n);
      list.forEach(function (p) {
        pos.set(p.positions, o);
        for (i = 0; i < p.colors.length; i++) col[o + i] = model.util.s2l(p.colors[i]);   // vertex colors are LINEAR in three
        o += p.positions.length;
      });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();                       // non-indexed => true facet normals
      return track(g);
    }
    function partGeometry(id, linearColors) {
      var p = built.parts.filter(function (q) { return q.id === id; })[0], g = new THREE.BufferGeometry(), i;
      g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
      if (linearColors) {
        var c = new Float32Array(p.colors.length);
        for (i = 0; i < c.length; i++) c[i] = model.util.s2l(p.colors[i]);
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
      if (p.normals) g.setAttribute('normal', new THREE.BufferAttribute(p.normals, 3)); else g.computeVertexNormals();
      if (p.uvs) g.setAttribute('uv', new THREE.BufferAttribute(p.uvs, 2));
      return track(g);
    }

    /* ---- materials (+ a small shader patch: soft fresnel contour / luminous edge) */
    var rimU = { uRimColor: { value: new THREE.Color(0x2b6c80) }, uRimDark: { value: 0.3 }, uRimAdd: { value: 0 }, uRimPow: { value: 2.6 } };
    function withRim(mat) {
      if (!useRim) return mat;
      mat.onBeforeCompile = function (shader) {
        shader.uniforms.uRimColor = rimU.uRimColor; shader.uniforms.uRimDark = rimU.uRimDark;
        shader.uniforms.uRimAdd = rimU.uRimAdd; shader.uniforms.uRimPow = rimU.uRimPow;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimDark;\nuniform float uRimAdd;\nuniform float uRimPow;')
          .replace('#include <opaque_fragment>',
            'float rimF = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), uRimPow);\n' +
            'outgoingLight = outgoingLight * (1.0 - uRimDark * rimF) + uRimColor * (uRimAdd * rimF);\n#include <opaque_fragment>');
      };
      mat.customProgramCacheKey = function () { return 'alk-rim'; };
      return mat;
    }
    var bodyMat = track(withRim(new THREE.MeshLambertMaterial({ vertexColors: true })));
    var trayMat = track(withRim(quality === 'high'
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 })
      : new THREE.MeshLambertMaterial({ vertexColors: true })));

    /* ---- canvas textures */
    function artTexture(ops) {
      var cv = document.createElement('canvas'); cv.width = cv.height = texSize;
      var ctx = cv.getContext('2d');
      ctx.translate(texSize / 2, texSize / 2); ctx.scale(texSize / 2, -texSize / (2 * A));
      paintOps(ctx, ops);
      var tx = new THREE.CanvasTexture(cv);
      tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
      return track(tx);
    }
    var ghostTex = artTexture(art.ops.ghost), coreTex = artTexture(art.ops.core), lidTex = artTexture(art.ops.lid);

    // soft warm bloom over the lid (the core "lighting up" through the cover)
    var glowTex = (function () {
      var s = 256, cv = document.createElement('canvas'); cv.width = cv.height = s;
      var ctx = cv.getContext('2d'), g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,226,186,0.95)'); g.addColorStop(0.35, 'rgba(250,184,106,0.55)'); g.addColorStop(1, 'rgba(246,169,95,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      var tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return track(tx);
    })();
    // halo spilling onto the chest, shaped like the patch (a superellipse distance field)
    var decalPart = built.parts.filter(function (p) { return p.id === 'patch-decal'; })[0];
    var haloTex = (function () {
      var s = 192, cv = document.createElement('canvas'); cv.width = cv.height = s;
      var ctx = cv.getContext('2d'), im = ctx.createImageData(s, s), half = decalPart.decalSize / 2, W2 = patch.halfWidth, n = art.n;
      var col = model.util.hex(art.colors.glow);
      for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) {
        var u = ((x + 0.5) / s * 2 - 1) * half / W2, v = (1 - (y + 0.5) / s * 2) * half / W2;
        var r = Math.pow(Math.pow(Math.abs(u), n) + Math.pow(Math.abs(v / A), n), 1 / n);
        var a = r < 1 ? 1 : Math.pow(1 - sstep(1.0, 2.0, r), 2.6);
        var k = (y * s + x) * 4;
        im.data[k] = col[0] * 255; im.data[k + 1] = col[1] * 255; im.data[k + 2] = col[2] * 255; im.data[k + 3] = a * 235;
      }
      ctx.putImageData(im, 0, 0);
      var tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return track(tx);
    })();

    function basicMat(map, order, extra) {
      var m = new THREE.MeshBasicMaterial({ map: map, transparent: true, depthWrite: false, toneMapped: false });
      if (extra) Object.keys(extra).forEach(function (k) { m[k] = extra[k]; });
      return track(m);
    }
    var ghostMat = basicMat(ghostTex), coreMat = basicMat(coreTex), lidMat = basicMat(lidTex);
    var topGlowMat = basicMat(glowTex, 0, { opacity: 0, blending: THREE.NormalBlending });
    var decalMat = basicMat(haloTex, 0, { opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

    /* ---- meshes */
    function mesh(geo, mat, order) { var m = new THREE.Mesh(geo, mat); m.renderOrder = order || 0; m.frustumCulled = true; breath.add(m); return m; }
    var bodyMesh = mesh(mergeParts(['torso', 'arm-l', 'arm-r']), bodyMat, 0);
    var trayMesh = mesh(partGeometry('patch-body', true), trayMat, 1);
    // faint facet hairlines, NIGHT only, built lazily (the hero on mist never pays for them)
    var edgeMat = track(new THREE.LineBasicMaterial({ color: 0x8ee3da, transparent: true, opacity: 0.17, depthWrite: false, toneMapped: false }));
    var edgeLines = null;
    function ensureEdges() {
      if (edgeLines || quality !== 'high') return;
      var g = track(new THREE.EdgesGeometry(bodyMesh.geometry, 1));
      edgeLines = new THREE.LineSegments(g, edgeMat); edgeLines.renderOrder = 2; edgeLines.scale.setScalar(1.004);   // lines float a hair above the facets (no z-fight, no polygonOffset on the body)
      edgeLines.visible = false; breath.add(edgeLines);
    }
    var decalMesh = mesh(partGeometry('patch-decal', false), decalMat, 5);
    var ghostMesh = mesh(partGeometry('patch-ghost', false), ghostMat, 10);
    var coreMesh = mesh(partGeometry('patch-core', false), coreMat, 11);
    var lidMesh = mesh(partGeometry('patch-lid', false), lidMat, 12);
    var topGlowMesh = mesh(partGeometry('patch-glow', false), topGlowMat, 13);

    /* ---- highlight: a warm ring that follows the chest curve + a soft bloom */
    var RING_SEG = 40, ringGeo = track(new THREE.BufferGeometry());
    var ringPos = new Float32Array((RING_SEG + 1) * 4 * 3), ringCol = new Float32Array((RING_SEG + 1) * 4 * 4), ringIdx = [];
    (function () {
      var i, r;
      for (i = 0; i <= RING_SEG; i++) for (r = 0; r < 4; r++) {
        var k = (i * 4 + r) * 4, a = (r === 1 || r === 2) ? 1 : 0;
        ringCol[k] = 1.0; ringCol[k + 1] = 0.62; ringCol[k + 2] = 0.24; ringCol[k + 3] = a;
      }
      for (i = 0; i < RING_SEG; i++) for (r = 0; r < 3; r++) {
        var a0 = i * 4 + r, b0 = (i + 1) * 4 + r;
        ringIdx.push(a0, b0, b0 + 1, a0, b0 + 1, a0 + 1);
      }
      ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3).setUsage(THREE.DynamicDrawUsage));
      ringGeo.setAttribute('color', new THREE.BufferAttribute(ringCol, 4));
      ringGeo.setIndex(ringIdx);
    })();
    var ringMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, opacity: 1 }));
    var ringMesh = new THREE.Mesh(ringGeo, ringMat); ringMesh.renderOrder = 20; ringMesh.visible = false; ringMesh.frustumCulled = false; breath.add(ringMesh);
    var bloomMat = basicMat(glowTex, 0, { opacity: 0, blending: THREE.AdditiveBlending });
    var bloomGeo = track(new THREE.PlaneGeometry(1, 1));
    var bloomMesh = new THREE.Mesh(bloomGeo, bloomMat); bloomMesh.renderOrder = 21; bloomMesh.visible = false; breath.add(bloomMesh);
    var basisM = new THREE.Matrix4().makeBasis(V3(patch.right), V3(patch.up), V3(patch.normal));
    bloomMesh.quaternion.setFromRotationMatrix(basisM);

    var hlId = null, hlAmount = 0, hlBuilt = null;
    function buildRing(id) {
      var L = model.layout[id], ru = L.radii[0], rv = L.radii[1], k = 0.085, i, r;
      var rf = [1 + k * 3.2, 1 + k, 1 - k, Math.max(0.2, 1 - k * 3.2)];
      var h = patch.layers.lid + 0.0065, ctr = patch.components[id].pos;
      for (i = 0; i <= RING_SEG; i++) {
        var th = TAU * i / RING_SEG, c = Math.cos(th), s = Math.sin(th);
        for (r = 0; r < 4; r++) {
          var p = model.patchPoint(patch, L.c[0] + ru * rf[r] * c, L.c[1] + rv * rf[r] * s, h), o = (i * 4 + r) * 3;
          ringPos[o] = p[0] - ctr[0]; ringPos[o + 1] = p[1] - ctr[1]; ringPos[o + 2] = p[2] - ctr[2];
        }
      }
      ringGeo.attributes.position.needsUpdate = true;
      ringGeo.computeBoundingSphere();
      ringMesh.position.set(ctr[0], ctr[1], ctr[2]);
      bloomMesh.position.set(ctr[0], ctr[1], ctr[2]);
      bloomMesh.position.addScaledVector(V3(patch.normal), patch.layers.lid + 0.011);
      var sz = Math.max(patch.components[id].radii[0], patch.components[id].radii[1]) * 3.4;
      bloomMesh.scale.set(patch.components[id].radii[0] * 3.4, patch.components[id].radii[1] * 3.4, 1);
      if (id !== 'wear') bloomMesh.scale.set(sz, sz, 1);
      hlBuilt = id;
    }

    /* ---- anchors + frames */
    var anchors = {}, frames = { component: {} };
    Object.keys(patch.components).forEach(function (id) {
      var c = patch.components[id];
      anchors[id] = { position: V3(c.pos), normal: V3(c.normal) };
    });
    var bodyPts = [];
    built.parts.forEach(function (p) {
      if (/^(torso|arm)/.test(p.id)) for (var i = 0; i < p.positions.length; i += 3) bodyPts.push([p.positions[i], p.positions[i + 1], p.positions[i + 2]]);
    });
    var aspect = 1, activeFrame = null;
    function setFrame(dst, src) {
      if (!dst.position) { dst.position = new THREE.Vector3(); dst.target = new THREE.Vector3(); }
      dst.position.set(src.position[0], src.position[1], src.position[2]);
      dst.target.set(src.target[0], src.target[1], src.target[2]);
      dst.fov = src.fov;
    }
    function updateFrames() {
      var f = model.frames(built, aspect);
      ['hero', 'heroFill', 'chest', 'patch'].forEach(function (k) { frames[k] = frames[k] || {}; setFrame(frames[k], f[k]); });
      Object.keys(f.component).forEach(function (id) { frames.component[id] = frames.component[id] || {}; setFrame(frames.component[id], f.component[id]); });
    }
    updateFrames();

    function applyFrame(fr) {
      activeFrame = fr || null;
      if (!fr) return;
      camera.position.copy(fr.position); camera.lookAt(fr.target);
      camera.fov = fr.fov; camera.updateProjectionMatrix();
    }
    function orbitFrame(azDeg, elDeg, margin) {
      var fr = model.fitFrame(bodyPts, model.orbitDir(azDeg, elDeg), 7.8, [0, 0, 0.1], aspect, margin != null ? margin : 0.06);
      var out = {}; setFrame(out, fr); return out;
    }

    /* ---- backdrop (lights, rim, glow strength) */
    var hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1); scene.add(hemi);
    var dirLights = model.rig.mist.lights.map(function () { var d = new THREE.DirectionalLight(0xffffff, 1); scene.add(d); return d; });
    var haloK = 0.6, coreGain = 1;
    function setBackdrop(name) {
      backdrop = name === 'night' ? 'night' : 'mist';
      var rig = model.rig[backdrop];
      hemi.color.set(rig.hemi.sky); hemi.groundColor.set(rig.hemi.ground); hemi.intensity = PI * rig.hemi.k;
      rig.lights.forEach(function (l, i) {
        var d = dirLights[i]; d.color.set(l.color); d.intensity = PI * l.k;
        d.position.set(l.nd[0] * 10, l.nd[1] * 10, l.nd[2] * 10);
      });
      rimU.uRimColor.value.set(rig.fres.color); rimU.uRimDark.value = rig.fres.dark; rimU.uRimAdd.value = rig.fres.add; rimU.uRimPow.value = rig.fres.pow;
      bodyMat.color.set(rig.tint); trayMat.color.set(0xffffff);
      haloK = rig.halo; coreGain = rig.coreGain;
      edgeMat.opacity = rig.edge || 0;
      if (rig.edge && quality === 'high') ensureEdges();
      if (edgeLines) edgeLines.visible = !!rig.edge;
      if (stats) { stats.edges = !!(edgeLines && edgeLines.visible); stats.drawCallsRendered = meshes.length - 2 + (stats.edges ? 1 : 0); stats.drawCallsMax = meshes.length + 1; }
      setTime(time);
    }

    /* ---- time: breathing + pulse + highlight animation */
    var time = 0, tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3();
    function setTime(t) {
      time = t || 0;
      var b = Math.sin(TAU * time / BREATH_PERIOD);
      breath.scale.set(1 + 0.0018 * b, 1 + 0.0035 * b, 1 + 0.0055 * b);          // <= 0.55 % on any axis
      var p = pulseAt(time);
      var g = coreGain * (0.84 + 0.16 * p);
      coreMat.color.setRGB(g, g, g);
      topGlowMat.opacity = (0.06 + 0.34 * p) * haloK;
      tmpV.set(patch.center[0], patch.center[1], patch.center[2]); breath.localToWorld(tmpV);
      var farK = sstep(0.9, 3.2, camera.position.distanceTo(tmpV));      // the chest halo belongs to the wide shots; up close it would just muddy the body
      decalMat.opacity = haloK * (0.16 + 0.44 * p) * (0.1 + 0.9 * farK);
      // highlight
      var on = hlId && hlAmount > 0.002;
      if (on) {
        if (hlBuilt !== hlId) buildRing(hlId);
        var wob = 1 + 0.045 * Math.sin(TAU * time / 1.3) * hlAmount;
        var grow = 1 + (1 - hlAmount) * 0.5;
        ringMesh.scale.setScalar(wob * grow);
        ringMat.opacity = Math.min(1, hlAmount * 1.2);
        bloomMat.opacity = hlAmount * (0.30 + 0.16 * Math.sin(TAU * time / 1.3 + 1.2)) * (backdrop === 'night' ? 1 : 0.8);
        // hide when the patch faces away from the camera (back of the torso is in front of it)
        tmpV.copy(anchors[hlId].position); breath.localToWorld(tmpV);
        tmpW.copy(camera.position).sub(tmpV).normalize();
        var nrm = tmpV.copy(anchors[hlId].normal).transformDirection(breath.matrixWorld);
        var vis = nrm.dot(tmpW) > 0.04;
        ringMesh.visible = vis; bloomMesh.visible = vis;
      } else { ringMesh.visible = false; bloomMesh.visible = false; }
    }
    function setHighlight(id, amount) {
      hlId = (id && patch.components[id]) ? id : null;
      hlAmount = hlId ? Math.max(0, Math.min(1, amount == null ? 1 : amount)) : 0;
      setTime(time);
    }

    function resize(w, h) {
      aspect = Math.max(0.05, (w || 1) / (h || 1));
      camera.aspect = aspect;
      updateFrames();
      if (activeFrame) { camera.fov = activeFrame.fov; camera.position.copy(activeFrame.position); camera.lookAt(activeFrame.target); }
      camera.updateProjectionMatrix();
    }
    // where the planar neck / hip cuts land in a frame (default: the active camera), as fractions of the
    // viewport height: {top, bottom}. The page fades the cuts with a CSS mask between these lines.
    function cutLines(fr) {
      var f = fr || activeFrame || frames.hero;
      function arr(v) { return v.toArray ? v.toArray() : v; }
      return model.cutLines(built, { position: arr(f.position), target: arr(f.target), fov: f.fov });
    }
    function dispose() {
      disposables.forEach(function (d) { if (d && d.dispose) d.dispose(); });
      scene.remove(rootG); scene.remove(hemi); dirLights.forEach(function (d) { scene.remove(d); });
    }

    // triangle / draw-call accounting
    var stats = null;
    var meshes = [bodyMesh, trayMesh, decalMesh, ghostMesh, coreMesh, lidMesh, topGlowMesh, ringMesh, bloomMesh], tris = 0;
    meshes.forEach(function (m) { var g = m.geometry; tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3; });
    stats = { triangles: tris, edgeTriangles: 0, meshes: meshes.length, drawCallsRendered: meshes.length - 2, drawCallsMax: meshes.length + 1, textures: 5, quality: quality, rim: useRim, edges: false };

    camera.position.set(0, 0, 8);
    setBackdrop(backdrop);
    applyFrame(frames.hero);
    setTime(0);

    return {
      scene: scene, camera: camera, root: rootG, anchors: anchors, frames: frames,
      setTime: setTime, setHighlight: setHighlight, setBackdrop: setBackdrop, resize: resize, dispose: dispose,
      applyFrame: applyFrame, orbitFrame: orbitFrame, cutLines: cutLines,
      maskGradient: function (fr, o) { return model.maskGradient(cutLines(fr), o); }, stats: stats, model: built,
      get backdrop() { return backdrop; }
    };
  }

  root.Alkyone.infant.scene = { create: create, pulseAt: pulseAt, PULSE_PERIOD: PULSE_PERIOD, BREATH_PERIOD: BREATH_PERIOD };
})();
