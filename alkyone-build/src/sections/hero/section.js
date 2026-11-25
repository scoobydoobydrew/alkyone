(function () {
  'use strict';
  var A = window.Alkyone;
  var PX = .533, PY = .505;                 /* where the patch sits on the photo, as fractions of the picture */
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var easeIO = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeO = function (t) { return 1 - Math.pow(1 - t, 3); };

  window.Alkyone.section('hero', {
    init: function (ctx) {
      var root = ctx.el;
      var $ = function (s) { return root.querySelector(s); };
      var pin = $('#hero-pin'), stage = $('#hero-stage'), photo = $('#hero-photo'), wrap = $('#hero-imgwrap'), copy = $('#hero-copy'), foot = $('#hero-foot');
      var zoom = $('#hero-zoom'), lens = $('#hero-lens'), kicker = $('.hero-zoom__kicker'), cap = $('.hero-zoom__cap'), card = $('#hero-card'), svg = $('#hero-circuit');
      var cn = $('#hero-card-n'), ct = $('#hero-card-t'), cp = $('#hero-card-p'), cg = $('#hero-card-tag'), mark = $('.hero-mark__pad');
      var steps = [].map.call(root.querySelectorAll('#hero-steps li'), function (li) {
        return { part: li.getAttribute('data-part'), title: li.getAttribute('data-title'), text: li.querySelector('p').textContent.trim(), exp: !!li.getAttribute('data-exp') };
      });
      var parts = [].slice.call(svg.querySelectorAll('.hc-part')), mks = [].slice.call(svg.querySelectorAll('.hc-mk'));
      var M = null, idx = -1, on = false, lastQ = -1;

      function measure() {
        var save = [photo.style.transform, lens.style.transform];
        photo.style.transform = 'none'; lens.style.transform = 'none';
        var pr = pin.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        var wl = wrap.offsetLeft - wrap.offsetWidth / 2, wt = wrap.offsetTop, ww = wrap.offsetWidth, wh = wrap.offsetHeight;
        var px = wl + PX * ww, py = wt + PY * wh, sx = sr.left - pr.left, sy = sr.top - pr.top;
        var lw = lens.offsetWidth, lc = { x: pr.width / 2, y: lens.offsetTop + lens.offsetHeight / 2 };
        var w0 = Math.max(10, mark.offsetWidth || 30);
        var S = clamp((.17 * lw) / w0, 3, 5.5);
        var k0 = clamp((w0 * S) / (.62 * lw), .18, .6);
        M = { px: px, py: py, sx: sx, sy: sy, P0: { x: sx + px, y: sy + py }, C: lc, S: S, k0: k0 };
        photo.style.transform = save[0]; lens.style.transform = save[1];
      }

      function setStep(i) {
        if (i === idx) return; idx = i;
        parts.forEach(function (g) { g.classList.toggle('is-hl', i >= 0 && g.getAttribute('data-part') === steps[i].part); });
        mks.forEach(function (g) { g.classList.toggle('is-hl', i >= 0 && g.getAttribute('data-for') === steps[i].part); });
        if (i < 0) { svg.removeAttribute('data-hl'); return; }
        svg.setAttribute('data-hl', '1');
        var s = steps[i];
        cn.textContent = String(i + 1); ct.textContent = s.title; cp.textContent = s.text; cg.hidden = !s.exp; if (s.exp) cg.textContent = 'Exploratory';
        card.classList.remove('is-swap'); void card.offsetWidth; if (!A.reduced) card.classList.add('is-swap');
      }

      function update() {
        if (!on || !M) return;
        var r = root.getBoundingClientRect(), total = Math.max(1, root.offsetHeight - window.innerHeight);
        var q = clamp(-r.top / total, 0, 1);
        if (Math.abs(q - lastQ) < .0004) return; lastQ = q;
        /* 1. the photo zooms toward the patch */
        var e = easeIO(clamp(q / .4)), s = 1 + (M.S - 1) * e;
        var cx = M.P0.x + (M.C.x - M.P0.x) * e, cy = M.P0.y + (M.C.y - M.P0.y) * e;
        photo.style.transform = 'translate3d(' + (cx - M.sx - s * M.px).toFixed(1) + 'px,' + (cy - M.sy - s * M.py).toFixed(1) + 'px,0) scale(' + s.toFixed(3) + ')';
        var po = 1 - smooth(.3, .48, q); photo.style.opacity = po.toFixed(3); photo.style.visibility = po < .01 ? 'hidden' : '';
        /* copy and foot step aside */
        var co = 1 - smooth(0, .16, q); copy.style.opacity = co.toFixed(3); copy.style.transform = 'translate3d(0,' + (-28 * (1 - co)).toFixed(1) + 'px,0)'; copy.style.visibility = co < .01 ? 'hidden' : '';
        var fo = 1 - smooth(0, .1, q); foot.style.opacity = fo.toFixed(3); foot.style.visibility = fo < .01 ? 'hidden' : '';
        stage.querySelector('.hero-caption').style.opacity = (1 - smooth(0, .12, q)).toFixed(3);
        /* 2. the flexible circuit arrives and grows to fill the plate */
        var zo = smooth(.3, .46, q);
        zoom.style.opacity = zo > .005 ? '1' : '0'; zoom.style.visibility = zo > .005 ? 'visible' : 'hidden';
        var k = M.k0 + (1 - M.k0) * easeO(smooth(.3, .64, q));
        lens.style.opacity = zo.toFixed(3); lens.style.transform = 'scale(' + k.toFixed(3) + ')';
        var to = smooth(.52, .64, q); kicker.style.opacity = to.toFixed(3); cap.style.opacity = to.toFixed(3);
        /* 3. one callout at a time */
        var f = clamp((q - .58) / .42), i = q < .58 ? -1 : Math.min(steps.length - 1, Math.floor(f * steps.length));
        setStep(i);
        card.style.opacity = smooth(.56, .62, q).toFixed(3);
      }

      function pinOn() {
        if (on) return; on = true; root.classList.add('is-pinned'); lastQ = -1; idx = -2; measure(); update();
      }
      function pinOff() {
        on = false; root.classList.remove('is-pinned');
        [photo, lens, copy, foot, zoom, card, kicker, cap].forEach(function (n) { n.style.cssText = ''; });
        var c = stage.querySelector('.hero-caption'); if (c) c.style.cssText = '';
        parts.forEach(function (g) { g.classList.remove('is-hl'); }); mks.forEach(function (g) { g.classList.remove('is-hl'); }); svg.removeAttribute('data-hl'); idx = -1;
      }
      function sync() { if (A.reduced) pinOff(); else pinOn(); }

      api = { sync: sync, update: update, remeasure: function () { if (!on) return; var q = lastQ; lastQ = -1; measure(); update(); } };
      sync();
      if (A.onResize) A.onResize(function () { api.remeasure(); });
      /* the image may arrive after the first measurement */
      var img = $('#hero-img'); if (img && !img.complete) img.addEventListener('load', function () { api.remeasure(); }, { once: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { api.remeasure(); });
    },
    progress: function () { if (api) api.update(); },
    resize: function () { if (api) api.remeasure(); },
    reducedChange: function () { if (api) api.sync(); }
  });
  var api = null;
})();
