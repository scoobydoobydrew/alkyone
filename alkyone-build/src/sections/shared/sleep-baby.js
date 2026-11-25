/* ============================================================================
   Alkyone · sleep-baby.js
   A small Three.js scene for the sleep replay: a smooth, sculpted baby in a sleepsuit lying on a flat mattress,
   with the amber sensor patch on the chest. The body rolls as one piece about its long axis; arms, legs and head
   settle into a posture that matches the roll (on back, on side, on tummy). Nothing else moves. No breathing.

   Alkyone.sleepBaby.create(THREE, { canvas, quality:'high'|'low' }) ->
     setAngle(deg, dt)   roll of the chest normal about the long axis, 0 = on back, 90 = on one side, 180 = on tummy.
                         dt (ms) lets the head turn follow softly; returns true while the head is still turning.
     resize(w, h, dpr)   render(), dispose()

   Units: the baby is about 5 units long. +X runs from head (left) to feet, +Y is up, +Z faces the viewer.
   ========================================================================== */
(function () {
  'use strict';
  var root = window; root.Alkyone = root.Alkyone || {};
  var PI = Math.PI, D2R = PI / 180;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sst(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }

  var C = { suit: '#C4E6E0', skin: '#FCD5BC', hair: '#5B3B2B', top: '#4A7F92', side: '#2D5565', amber: '#F6A95F', dark: '#5A3C34', lip: '#C9787A' };

  /* torso cross-sections along its length: [x, half-width (z), half-depth (y)] */
  var PROF = [[-1.15, .48, .41], [-.8, .68, .56], [-.38, .75, .60], [0, .73, .62], [.4, .70, .62], [.8, .64, .57], [1.15, .54, .47]];
  function prof(x) {
    for (var i = 0; i < PROF.length - 1; i++) {
      var a = PROF[i], b = PROF[i + 1];
      if (x <= b[0] || i === PROF.length - 2) { var t = sst(a[0], b[0], x); return [mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
    }
  }
  /* posture keys, in the torso's own frame, for the limb on the +z side. [elbow|knee, hand|foot] */
  var SH = [-.55, -.02, .42], HIP = [.92, -.05, .28], LA = [.82, .74], LL = [1.0, .92];
  var ARM = {
    back: [[-.88, -.30, 1.12], [-1.55, -.14, 1.32]],
    tummy: [[-.86, .30, 1.12], [-1.50, .16, 1.22]],
    under: [[-.74, .62, .34], [-1.32, 1.12, .28]],
    top: [[-.70, .78, -.50], [-1.22, 1.22, -.18]]
  };
  var LEG = {
    back: [[1.42, .24, 1.08], [1.92, -.34, .64]],
    tummy: [[1.46, .26, 1.10], [2.06, .30, .56]],
    under: [[.60, .74, .24], [1.40, .86, .20]],
    top: [[.50, .78, -.52], [1.26, .98, -.38]]
  };

  function create(THREE, o) {
    var V3 = THREE.Vector3, hi = o.quality !== 'low';
    var renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, .1, 80);
    var W = 1, H = 1, disposables = [];
    function keep(x) { disposables.push(x); return x; }
    function mat(color, rough, extra) { var m = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: rough, metalness: 0 }, extra || {})); return keep(m); }
    function mesh(geo, m, parent, shadow) { var s = new THREE.Mesh(keep(geo), m); if (shadow !== false) { s.castShadow = true; s.receiveShadow = true; } (parent || scene).add(s); return s; }
    function tex(w, h, paint) { var c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return keep(t); }
    function glowTex(rgb) { return tex(128, 128, function (g, w, h) { var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(.45, 'rgba(' + rgb + ',.35)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); }

    /* ---- light: a cool moon from the upper left, a teal rim from behind, a warm lamp low on the right ---- */
    scene.add(new THREE.HemisphereLight(0xC4D8F0, 0x34455E, 1.15));
    var key = new THREE.DirectionalLight(0xE2ECFF, 2.1); key.position.set(-3.5, 7.5, 5);
    key.castShadow = true; key.shadow.mapSize.set(hi ? 1024 : 512, hi ? 1024 : 512);
    var sc = key.shadow.camera; sc.left = -5.5; sc.right = 5.5; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 20; key.shadow.bias = -.0007; key.shadow.normalBias = .025; key.shadow.radius = 5;
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x78C6D4, 1.0); rim.position.set(4, 3, -6); scene.add(rim);
    var lamp = new THREE.PointLight(0xFFB06E, 16, 0, 2); lamp.position.set(3.8, 2.6, 3.6); scene.add(lamp);

    /* ---- the mattress: flat, with a quilted top and a stitched edge. No pillow, no blanket. ---- */
    var MW = 6.9, MD = 4.5, MT = .34;
    var top = tex(512, 320, function (g, w, h) {
      g.fillStyle = C.top; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.075)'; g.lineWidth = 2;
      for (var i = -h; i < w + h; i += 40) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
      g.setLineDash([9, 7]); g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2.5;
      var r = 26; g.beginPath(); g.roundRect ? g.roundRect(18, 18, w - 36, h - 36, r) : g.rect(18, 18, w - 36, h - 36); g.stroke();
    });
    top.repeat.set(1 / (MW + .2), 1 / (MD + .2)); top.offset.set(.5, .5); top.wrapS = top.wrapT = THREE.RepeatWrapping;
    var sh = new THREE.Shape(), rr = .75, hx = MW / 2, hz = MD / 2;
    sh.moveTo(-hx + rr, -hz); sh.lineTo(hx - rr, -hz); sh.quadraticCurveTo(hx, -hz, hx, -hz + rr); sh.lineTo(hx, hz - rr); sh.quadraticCurveTo(hx, hz, hx - rr, hz);
    sh.lineTo(-hx + rr, hz); sh.quadraticCurveTo(-hx, hz, -hx, hz - rr); sh.lineTo(-hx, -hz + rr); sh.quadraticCurveTo(-hx, -hz, -hx + rr, -hz);
    var mg = new THREE.ExtrudeGeometry(sh, { depth: MT, bevelEnabled: true, bevelThickness: .1, bevelSize: .1, bevelSegments: 4, curveSegments: 10 });
    mg.rotateX(-PI / 2); mg.computeBoundingBox(); mg.translate(0, -mg.boundingBox.max.y, 0);
    var mattress = new THREE.Mesh(keep(mg), [mat('#FFFFFF', .95, { map: top }), mat(C.side, .95)]); mattress.receiveShadow = true; scene.add(mattress);
    var halo = new THREE.Mesh(keep(new THREE.PlaneGeometry(11.5, 8)), keep(new THREE.MeshBasicMaterial({ map: glowTex('2,10,18'), transparent: true, opacity: .55, depthWrite: false })));
    halo.rotation.x = -PI / 2; halo.position.y = -.62; scene.add(halo);

    /* ---- the baby ---- */
    var suit = mat(C.suit, .92), skin = mat(C.skin, .6, { emissive: 0x9A4A32, emissiveIntensity: .2 });
    var unitSphere = keep(new THREE.SphereGeometry(1, 24, 16)), torsoG = new THREE.Group(); scene.add(torsoG);
    /* torso: elliptical sections swept along x, rounded at both ends */
    (function () {
      var n = 30, seg = 32, pos = [], idx = [], i, k;
      for (i = 0; i < n; i++) {
        var u = -Math.cos(PI * i / (n - 1)), x = u * 1.15, p = prof(x), f = Math.pow(Math.max(.0004, 1 - Math.pow(Math.abs(u), 2.6)), .45);
        for (k = 0; k < seg; k++) { var a = k / seg * PI * 2; pos.push(x, Math.sin(a) * p[1] * f, Math.cos(a) * p[0] * f); }
      }
      for (i = 0; i < n - 1; i++) for (k = 0; k < seg; k++) { var k2 = (k + 1) % seg, a0 = i * seg + k, b0 = i * seg + k2, c0 = (i + 1) * seg + k2, d0 = (i + 1) * seg + k; idx.push(a0, d0, b0, b0, d0, c0); }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      mesh(g, suit, torsoG);
    })();
    /* limbs: a tapered tube per segment and a ball per joint, repositioned from the posture keys */
    function tube(r0, r1, m, parent) { return mesh(new THREE.CylinderGeometry(r1, r0, 1, 20, 1, true), m, parent); }
    function ball(r, m, parent) { var s = new THREE.Mesh(unitSphere, m); s.scale.setScalar(r); s.castShadow = s.receiveShadow = true; (parent || scene).add(s); return s; }
    var limbs = [1, -1].map(function (s) {
      return {
        s: s,
        a1: tube(.28, .24, suit, torsoG), a2: tube(.24, .2, suit, torsoG), ae: ball(.24, suit, torsoG), as: ball(.28, suit, torsoG), ah: ball(.22, skin, torsoG),
        l1: tube(.37, .3, suit, torsoG), l2: tube(.3, .23, suit, torsoG), le: ball(.3, suit, torsoG), lh: ball(.37, suit, torsoG), lf: ball(.25, skin, torsoG)
      };
    });
    var Y = new V3(0, 1, 0), tmpA = new V3(), tmpB = new V3(), tmpQ = new THREE.Quaternion();
    function seg(m, a, b) { tmpA.set(a[0], a[1], a[2]); tmpB.set(b[0], b[1], b[2]).sub(tmpA); var l = tmpB.length() || 1; m.position.copy(tmpA).addScaledVector(tmpB, .5); m.scale.set(1, l, 1); m.quaternion.setFromUnitVectors(Y, tmpB.multiplyScalar(1 / l)); }
    function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    function reach(p, q, len) { var d = norm([q[0] - p[0], q[1] - p[1], q[2] - p[2]]); return [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len]; }
    function key3(K, idx, s, g, wB, wS, wT) {          /* blended joint position for the limb on side s, lying on side g */
      var kb = K.back[idx], kt = K.tummy[idx], ks = (s === g ? K.under : K.top)[idx];
      return [wB * kb[0] + wS * ks[0] + wT * kt[0], wB * kb[1] + wS * ks[1] + wT * kt[1], wB * kb[2] * s + wS * ks[2] * g + wT * kt[2] * s];
    }
    var headG = new THREE.Group(), RH = .84; scene.add(headG); headG.position.set(-2.02, RH, 0);
    var head = mesh(new THREE.SphereGeometry(RH, 36, 24), skin, headG); head.scale.set(1.0, .98, .93);
    var neck = ball(.31, skin, scene);
    function hp(u, v, r) {      /* a point on the face side of the head: u toward the crown, v toward +z, face looks along +y */
      var cu = Math.cos(u), d = new V3(-Math.sin(u), cu * Math.cos(v), cu * Math.sin(v)).normalize();
      return d.multiplyScalar(r || RH * 1.0).multiply(new V3(1.0, .98, .93));
    }
    function arc(c, u0, v0, du, dv, bow, rad, m) {
      var pts = [], t;
      for (t = -1; t <= 1.001; t += .25) pts.push(hp(u0 + du * t - bow * (1 - t * t), v0 + dv * t, RH * 1.004));
      return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, rad, 6, false), m, headG, false);
    }
    var eyeM = mat(C.dark, .7), lipM = mat(C.lip, .7);
    [-1, 1].forEach(function (s) {
      arc(headG, .10, s * .40, .0, .17, .05, .018, eyeM);
      var cheek = new THREE.Mesh(keep(new THREE.PlaneGeometry(.5, .5)), keep(new THREE.MeshBasicMaterial({ map: glowTex('240,128,120'), transparent: true, opacity: .5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
      var cp = hp(-.22, s * .56, RH * 1.012); cheek.position.copy(cp); cheek.quaternion.setFromUnitVectors(new V3(0, 0, 1), cp.clone().normalize()); headG.add(cheek);
      var ear = new THREE.Mesh(unitSphere, skin); ear.scale.set(.07, .17, .13); ear.position.copy(hp(-.04, s * 1.5, RH * .98)); ear.position.x += .08; ear.castShadow = true; headG.add(ear);
    });
    arc(headG, -.42, 0, .0, .09, .02, .016, lipM);
    var nose = new THREE.Mesh(unitSphere, skin); nose.scale.setScalar(.085); nose.position.copy(hp(-.04, 0, RH * 1.02)); headG.add(nose);
    (function () {                                      /* a little soft hair on the crown */
      var g = new THREE.SphereGeometry(RH * 1.02, 32, 18, 0, PI * 2, 0, 1.3); g.rotateZ(PI / 2 + .45);
      var hr = mesh(g, mat(C.hair, 1), headG, false); hr.scale.set(1.0, .98, .93);
    })();

    /* the patch: a thin amber pill on the upper chest, with a glow and a short arrow along its normal */
    var patchG = new THREE.Group(); torsoG.add(patchG);
    (function () {
      var px = -.5, pz = .2, p = prof(px), y = p[1] * Math.sqrt(1 - Math.pow(pz / p[0], 2)), nz = pz / (p[0] * p[0]), ny = y / (p[1] * p[1]);
      patchG.position.set(px, y + .012, pz); patchG.rotation.x = Math.atan2(nz, ny);
      var g = new THREE.CapsuleGeometry(.14, .46, 6, 18); g.rotateZ(PI / 2); g.scale(1, .5, 1);
      mesh(g, mat(C.amber, .5, { emissive: 0xE08A3C, emissiveIntensity: .75 }), patchG);
    })();
    var glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex('246,169,95'), transparent: true, opacity: .5, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })));
    glow.scale.setScalar(2.1); glow.renderOrder = 9; patchG.add(glow); glow.position.y = .1;
    var arrowM = keep(new THREE.MeshBasicMaterial({ color: 0xFFE2BE, transparent: true, opacity: .8, depthTest: false }));
    var shaft = new THREE.Mesh(keep(new THREE.CylinderGeometry(.018, .018, .8, 8)), arrowM), tip = new THREE.Mesh(keep(new THREE.ConeGeometry(.075, .24, 14)), arrowM);
    shaft.position.y = .5; tip.position.y = 1.0; shaft.renderOrder = tip.renderOrder = 8; patchG.add(shaft); patchG.add(tip);

    /* ---- camera: fixed three-quarter view from the front and above, refitted to the plate's aspect ---- */
    var PTS = [];
    [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { [0, -.55].forEach(function (c) { PTS.push(new V3(a * MW / 2, c, b * MD / 2)); }); }); });
    [[-2.95, 1.0, 0], [-2, 2.1, 0], [2.6, .6, 1.7], [2.6, .6, -1.7], [-1.6, 1.5, 1.9], [-1.6, 1.5, -1.9]].forEach(function (p) { PTS.push(new V3(p[0], p[1], p[2])); });
    function fit() {
      var dir = new V3(.26, .68, 1).normalize(), tgt = new V3(.05, .15, 0), d = 16, it, v = new V3();
      camera.aspect = W / H;
      for (it = 0; it < 6; it++) {
        camera.position.copy(tgt).addScaledVector(dir, d); camera.lookAt(tgt); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
        var mx = 0, my = 0; PTS.forEach(function (p) { v.copy(p).project(camera); mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y)); });
        d *= clamp(Math.max(mx / .93, my / .9), .7, 1.4);
      }
      camera.position.copy(tgt).addScaledVector(dir, d); camera.lookAt(tgt); camera.updateMatrixWorld(true);
    }

    /* ---- posture ---- */
    var hr = 0, headSign = 1, last = null;
    var tn = new V3(), tp = new V3(), cv = new V3();
    function setAngle(deg, dt) {
      var w = ((deg % 360) + 360) % 360; if (w > 180) w -= 360;
      var a = Math.abs(w), g = w < 0 ? -1 : 1, th = deg * D2R;
      var s1 = sst(0, 90, a), s2 = sst(90, 180, a), wB = 1 - s1, wT = s2, wS = s1 - s2;
      var pr = prof(-.4), ty = Math.sqrt(Math.pow(pr[1] * Math.cos(th), 2) + Math.pow(pr[0] * Math.sin(th), 2));
      torsoG.rotation.x = th; torsoG.position.y = ty - .02;
      limbs.forEach(function (L) {
        var s = L.s, Sh = [SH[0], SH[1], SH[2] * s], Hp = [HIP[0], HIP[1], HIP[2] * s];
        var e = reach(Sh, key3(ARM, 0, s, g, wB, wS, wT), LA[0]), h = reach(e, key3(ARM, 1, s, g, wB, wS, wT), LA[1]);
        seg(L.a1, Sh, e); seg(L.a2, e, h); L.ae.position.set(e[0], e[1], e[2]); L.as.position.set(Sh[0], Sh[1], Sh[2]);
        var hd = norm([h[0] - e[0], h[1] - e[1], h[2] - e[2]]); L.ah.position.set(h[0] + hd[0] * .1, h[1] + hd[1] * .1, h[2] + hd[2] * .1); L.ah.scale.set(.23, .2, .21);
        var k = reach(Hp, key3(LEG, 0, s, g, wB, wS, wT), LL[0]), f = reach(k, key3(LEG, 1, s, g, wB, wS, wT), LL[1]);
        seg(L.l1, Hp, k); seg(L.l2, k, f); L.le.position.set(k[0], k[1], k[2]); L.lh.position.set(Hp[0], Hp[1], Hp[2]);
        var fd = norm([f[0] - k[0], f[1] - k[1], f[2] - k[2]]); L.lf.position.set(f[0] + fd[0] * .1, f[1] + fd[1] * .1, f[2] + fd[2] * .1); L.lf.scale.set(.36, .26, .29);
        tmpQ.setFromUnitVectors(new V3(1, 0, 0), new V3(fd[0], fd[1], fd[2])); L.lf.quaternion.copy(tmpQ);
      });
      /* head: it turns with the body on the way to the side, then rests on its cheek and stays facing the same way while on the tummy */
      if (a < 130) headSign = g;
      var hrAbs = a <= 70 ? a : 70 + (a - 70) * 30 / 110, tgt = headSign * hrAbs * D2R, moving = false;
      if (dt) { hr += (tgt - hr) * (1 - Math.exp(-dt / 240)); if (Math.abs(tgt - hr) < .003) hr = tgt; else moving = true; } else hr = tgt;
      headG.rotation.x = hr;
      neck.position.set(-1.32, mix(torsoG.position.y, RH, .55), 0); neck.scale.set(.3, .3, .3);
      /* the sensor reads as bright when it faces the viewer; a faint glow stays when it is turned away or pressed down */
      patchG.updateWorldMatrix(true, false); patchG.getWorldPosition(tp); tn.set(0, 1, 0).transformDirection(patchG.matrixWorld);
      var facing = tn.dot(cv.copy(camera.position).sub(tp).normalize()), fv = clamp(facing * 1.5, 0, 1);
      glow.material.opacity = .14 + .42 * fv; arrowM.opacity = .35 + .5 * fv;
      return moving;
    }
    function resize(w, h, dpr) { W = Math.max(1, w); H = Math.max(1, h); renderer.setPixelRatio(dpr || 1); renderer.setSize(W, H, false); fit(); }
    function render() { renderer.render(scene, camera); }
    function dispose() {
      disposables.forEach(function (d) { try { d.dispose(); } catch (e) {} });
      try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {}
    }
    resize(o.width || 640, o.height || 540, o.dpr || 1);
    setAngle(o.angle || 0);
    return { setAngle: setAngle, resize: resize, render: render, dispose: dispose, camera: camera, scene: scene, renderer: renderer };
  }
  root.Alkyone.sleepBaby = { create: create };
})();
