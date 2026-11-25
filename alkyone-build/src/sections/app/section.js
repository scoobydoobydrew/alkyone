(function () {
  'use strict';
  var A = window.Alkyone;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var START = 20 * 60 + 30, NOW = 26 * 60 + 14, SPAN = NOW - START;      /* 20:30 to 02:14, minutes */
  var TABS = ['live', 'sleep', 'alerts', 'log'];
  var KINDS = {
    feeding: { name: 'Feeding', label: 'Note (optional)', hint: '' },
    diaper: { name: 'Diaper change', label: 'Note (optional)', hint: '' },
    sstart: { name: 'Sleep start', label: 'Note (optional)', hint: '' },
    sstop: { name: 'Sleep stop', label: 'Note (optional)', hint: '' },
    med: { name: 'Medication', label: 'What was given (free text)', hint: 'Free text only. This demo gives no advice and keeps no dosing.' },
    note: { name: 'Note', label: 'Note', hint: '' }
  };
  var ICON = { feeding: 'app-i-feeding', diaper: 'app-i-diaper', sstart: 'app-i-sstart', sstop: 'app-i-sstop', med: 'app-i-med', note: 'app-i-note' };

  /* the simulated night: sensor events and the seeded manual entries (all invented for the demo) */
  var SENSOR = [
    { t: '21:05', title: 'Fell asleep', icon: 'app-i-sleep' },
    { t: '21:35', title: 'Position changed: on side', icon: 'app-i-pos' },
    { t: '22:40', title: 'Movement', icon: 'app-i-live' },
    { t: '23:30', title: 'Position changed: on back', icon: 'app-i-pos' },
    { t: '23:48', title: 'Signal lost', icon: 'app-i-link', alert: true, detail: 'No heartbeat from the patch. Acknowledged 23:49.' },
    { t: '23:52', title: 'Signal back', icon: 'app-i-link' },
    { t: '00:20', title: 'Woke up', icon: 'app-i-sleep' },
    { t: '00:45', title: 'Fell asleep', icon: 'app-i-sleep' },
    { t: '01:05', title: 'Patch lost skin contact', icon: 'app-i-patch', alert: true, detail: 'Acknowledged 01:06.' },
    { t: '01:10', title: 'Skin contact back', icon: 'app-i-patch' }
  ];
  var SEEDS = [
    { kind: 'feeding', time: '20:45', text: 'Evening feed' },
    { kind: 'diaper', time: '21:00', text: '' },
    { kind: 'feeding', time: '00:30', text: 'Short feed' },
    { kind: 'note', time: '01:50', text: 'Room felt a little warm' }
  ];
  var BLOCKS = [['20:30', '21:05', 'awake'], ['21:05', '00:20', 'asleep'], ['00:20', '00:45', 'awake'], ['00:45', '02:14', 'asleep']];

  function mins(hhmm) { var p = hhmm.split(':'); var m = (+p[0]) * 60 + (+p[1]); return m < 12 * 60 ? m + 1440 : m; }
  function pct(m) { return Math.max(0, Math.min(100, (m - START) / SPAN * 100)); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function icon(id) { var s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('class', 'app-ico'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); var u = document.createElementNS(SVGNS, 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); return s; }

  window.Alkyone.section('app', {
    init: function (ctx) {
      var root = ctx.el;
      var $ = function (s) { return root.querySelector(s); };
      var tabsEl = $('#app-tabs'), track = $('#app-track'), ind = $('#app-ind');
      var tabs = TABS.map(function (k) { return $('#app-tab-' + k); });
      var panels = TABS.map(function (k) { return $('#app-panel-' + k); });
      var toast = $('#app-toast'), tl = $('#app-timeline'), strip = $('#app-strip'), recent = $('#app-recent'), recentEmpty = $('#app-recent-empty');
      var picker = $('#app-picker'), form = $('#app-form'), fTime = $('#app-f-time'), fText = $('#app-f-text'), fLabel = $('#app-f-label'), fHint = $('#app-f-hint'), fErr = $('#app-f-err'), fTitle = $('#app-form-title');
      var tilt = $('#app-tilt'), hrEl = $('#app-hr'), spEl = $('#app-spo2'), tpEl = $('#app-temp'), wave = $('#app-wave');
      var active = false, cur = 0, entries = [], nextId = 1, formKind = null, toastT = 0, newId = 0, scrollT = 0, settling = false;

      /* ---------- tabs ---------- */
      function paintTabs(i) {
        cur = i;
        tabs.forEach(function (t, k) { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); t.tabIndex = k === i ? 0 : -1; });
        panels.forEach(function (p, k) { if (k === i) { p.removeAttribute('inert'); p.tabIndex = 0; } else { p.setAttribute('inert', ''); p.tabIndex = -1; } });
        ind.style.transform = 'translateX(' + (i * 100) + '%)';
        live(i === 0);
      }
      function go(i, focusTab) {
        i = Math.max(0, Math.min(TABS.length - 1, i));
        paintTabs(i);
        settling = true; clearTimeout(scrollT);
        track.scrollTo({ left: i * track.clientWidth, behavior: A.reduced ? 'auto' : 'smooth' });
        scrollT = setTimeout(function () { settling = false; }, A.reduced ? 50 : 600);
        if (focusTab) tabs[i].focus();
      }
      tabs.forEach(function (t, i) { t.addEventListener('click', function () { go(i); }); });
      tabsEl.addEventListener('keydown', function (e) {
        var k = e.key, i = cur;
        if (k === 'ArrowRight') i++; else if (k === 'ArrowLeft') i--; else if (k === 'Home') i = 0; else if (k === 'End') i = TABS.length - 1; else return;
        e.preventDefault(); go(i, true);
      });
      track.addEventListener('scroll', function () {
        if (settling) return;
        clearTimeout(scrollT);
        scrollT = setTimeout(function () { var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (i !== cur) paintTabs(i); }, 90);
      }, { passive: true });

      /* mouse drag (touch and trackpads scroll natively) */
      var drag = null;
      track.classList.add('is-grab');
      track.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('button, input, a, label, .term')) return;
        drag = { x: e.clientX, left: track.scrollLeft, moved: false };
      });
      window.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x;
        if (!drag.moved && Math.abs(dx) < 5) return;
        if (!drag.moved) { drag.moved = true; track.classList.add('is-dragging'); track.style.scrollSnapType = 'none'; }
        track.scrollLeft = drag.left - dx;
      });
      function endDrag() {
        if (!drag) return;
        var moved = drag.moved; drag = null;
        if (!moved) return;
        track.classList.remove('is-dragging'); track.style.scrollSnapType = '';
        go(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
      }
      window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);

      /* ---------- the timeline ---------- */
      function render() {
        var rows = SENSOR.map(function (s) { return { m: mins(s.t), t: s.t, sensor: s }; });
        entries.forEach(function (e) { rows.push({ m: mins(e.time), t: e.time, entry: e }); });
        rows.push({ m: NOW + 0.5, t: '02:14', now: true });
        rows.sort(function (a, b) { return b.m - a.m; });
        tl.textContent = '';
        rows.forEach(function (r) {
          var li = el('li', 'app-tl');
          var title = el('p', 'app-tl__title'), body = el('div', 'app-tl__body'), node = el('span', 'app-tl__node');
          node.setAttribute('aria-hidden', 'true');
          if (r.now) { li.classList.add('app-tl--now'); title.textContent = 'Now'; }
          else if (r.sensor) {
            if (r.sensor.alert) li.classList.add('app-tl--alert');
            node.appendChild(icon(r.sensor.icon)); title.appendChild(document.createTextNode(r.sensor.title)); title.appendChild(el('span', 'app-tag', 'Sensor'));
          } else {
            li.classList.add('app-tl--you'); node.appendChild(icon('app-i-hand'));
            title.appendChild(document.createTextNode(KINDS[r.entry.kind].name)); title.appendChild(el('span', 'app-tag app-tag--you', 'You'));
            if (r.entry.id === newId) { li.classList.add('is-new'); title.appendChild(el('span', 'app-new', 'New')); }
          }
          body.appendChild(title);
          var detail = r.entry ? r.entry.text : (r.sensor && r.sensor.detail) || '';
          if (detail) body.appendChild(el('p', 'app-tl__detail', detail));
          li.appendChild(el('span', 'app-tl__time', r.t)); li.appendChild(node); li.appendChild(body);
          tl.appendChild(li);
        });
        /* overview strip */
        strip.textContent = '';
        BLOCKS.forEach(function (b) { var s = el('span', 'app-strip__seg app-strip__seg--' + b[2]); var a = pct(mins(b[0])), z = pct(mins(b[1])); s.style.left = a + '%'; s.style.width = (z - a) + '%'; strip.appendChild(s); });
        var dots = root.querySelector('.app-strip__dots');
        if (!dots) { dots = el('div', 'app-strip__dots'); dots.setAttribute('aria-hidden', 'true'); strip.parentNode.insertBefore(dots, root.querySelector('.app-strip__axis')); }
        dots.textContent = '';
        entries.forEach(function (e) { var d = el('i', 'app-strip__dot'); d.style.left = pct(mins(e.time)) + '%'; dots.appendChild(d); });
        /* recent entries */
        recent.textContent = '';
        entries.slice().sort(function (a, b) { return b.id - a.id; }).forEach(function (e) {
          var li = el('li', 'app-ent' + (e.id === newId ? ' is-new' : '')), main = el('div', 'app-ent__main');
          var p = el('p', 'app-ent__t'); p.appendChild(el('span', 'app-ent__time', e.time)); p.appendChild(document.createTextNode(KINDS[e.kind].name)); main.appendChild(p);
          if (e.text) main.appendChild(el('p', 'app-ent__x', e.text));
          var rm = el('button', 'app-ent__rm', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + KINDS[e.kind].name + ' at ' + e.time);
          rm.addEventListener('click', function () { entries = entries.filter(function (x) { return x.id !== e.id; }); newId = 0; render(); say('Entry removed'); });
          li.appendChild(main); li.appendChild(rm); recent.appendChild(li);
        });
        recentEmpty.hidden = entries.length > 0;
      }
      function say(msg) {
        toast.textContent = msg; toast.classList.add('is-on'); clearTimeout(toastT);
        toastT = setTimeout(function () { toast.classList.remove('is-on'); }, 2200);
      }
      function seed() {
        entries = SEEDS.map(function (s) { return { id: nextId++, kind: s.kind, time: s.time, text: s.text }; }); newId = 0;
      }

      /* ---------- log form ---------- */
      function openForm(kind) {
        formKind = kind; var k = KINDS[kind];
        fTitle.textContent = k.name; fLabel.textContent = k.label; fText.value = ''; fTime.value = '02:14';
        fHint.hidden = !k.hint; fHint.textContent = k.hint; fErr.hidden = true; fErr.textContent = '';
        picker.hidden = true; form.hidden = false; fTitle.focus();
      }
      function closeForm(focusTile) {
        form.hidden = true; picker.hidden = false;
        if (focusTile) { var t = picker.querySelector('[data-kind="' + focusTile + '"]'); if (t) t.focus(); }
      }
      picker.addEventListener('click', function (e) { var b = e.target.closest('.app-logtile'); if (b) openForm(b.getAttribute('data-kind')); });
      $('#app-f-cancel').addEventListener('click', function () { closeForm(formKind); });
      form.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); closeForm(formKind); } });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = fTime.value, m = v ? mins(v) : -1;
        if (!v || m < START || m > NOW) { fErr.textContent = 'Pick a time between 20:30 and 02:14, the simulated night.'; fErr.hidden = false; fTime.focus(); return; }
        var e2 = { id: nextId++, kind: formKind, time: v, text: fText.value.trim().slice(0, 80) };
        entries.push(e2); newId = e2.id; render(); closeForm(formKind);
        say('Added to the timeline'); if (A.announce) A.announce('Added to the timeline');
        setTimeout(function () { if (newId === e2.id) { newId = 0; var n = tl.querySelectorAll('.is-new .app-new'); for (var i = 0; i < n.length; i++) n[i].remove(); } }, 2600);
      });
      $('#app-viewtl').addEventListener('click', function () { go(1); });
      $('#app-reset').addEventListener('click', function () { nextId = 1; seed(); render(); closeForm(); say('Demo reset'); });

      /* ---------- live values and the pulse trace ---------- */
      var hr = 128, running = null, t0 = 0, driftAcc = 0, ctx2 = null, W = 0, H = 0, DPR = 1;
      function size() {
        DPR = Math.min(2, window.devicePixelRatio || 1); W = wave.clientWidth; H = wave.clientHeight;
        wave.width = Math.max(1, Math.round(W * DPR)); wave.height = Math.max(1, Math.round(H * DPR)); ctx2 = wave.getContext('2d');
      }
      function beat(ph) {      /* one cycle, ph 0..1 */
        if (ph < .1) return Math.sin(ph / .1 * Math.PI) * .12;
        if (ph < .2) return 0;
        if (ph < .24) return -(ph - .2) / .04 * .18;
        if (ph < .29) return -.18 + (ph - .24) / .05 * 1.18;
        if (ph < .34) return 1 - (ph - .29) / .05 * 1.28;
        if (ph < .4) return -.28 + (ph - .34) / .06 * .28;
        if (ph < .6) return Math.sin((ph - .4) / .2 * Math.PI) * .22;
        return 0;
      }
      function draw(t) {
        if (!ctx2) return;
        ctx2.clearRect(0, 0, wave.width, wave.height);
        ctx2.save(); ctx2.scale(DPR, DPR);
        ctx2.lineWidth = 1.6; ctx2.lineJoin = 'round'; ctx2.strokeStyle = '#8ED8D0'; ctx2.shadowColor = 'rgba(142,216,208,.5)'; ctx2.shadowBlur = 4;
        ctx2.beginPath();
        var period = 60 / hr, speed = 70;
        for (var x = 0; x <= W; x += 2) {
          var tt = t - (W - x) / speed, ph = ((tt / period) % 1 + 1) % 1;
          var y = H * .68 - beat(ph) * H * .55;
          if (x === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
        }
        ctx2.stroke(); ctx2.restore();
      }
      function drift(sec) {
        hr = Math.round(128 + 3 * Math.sin(sec / 7) + 2 * Math.sin(sec / 2.3));
        hrEl.textContent = String(hr);
        spEl.textContent = String(97 + (Math.sin(sec / 11) > .6 ? 1 : 0) - (Math.sin(sec / 13) < -.7 ? 1 : 0));
        tpEl.textContent = (36.4 + Math.round(Math.sin(sec / 19) * 1) / 10).toFixed(1);
      }
      function live(on) {
        if (on && active && !running) {
          size(); t0 = performance.now();
          if (A.reduced) { draw(0); return; }
          running = A.raf(function (t, dt) {
            var sec = (performance.now() - t0) / 1000;
            driftAcc += dt || 16; if (driftAcc > 1000) { driftAcc = 0; drift(sec); }
            draw(sec);
          }, { fps: 30 });
        } else if (!on && running) { running(); running = null; }
      }

      seed(); render(); paintTabs(0);
      api = { setActive: function (a) { active = a; live(a && cur === 0); }, live: live, redraw: function () { if (cur === 0) { if (running) { running(); running = null; } live(true); } }, resize: function () { go(cur); size(); }, tilt: tilt, go: go };
    },
    enter: function () { if (api) api.setActive(true); },
    leave: function () { if (api) api.setActive(false); },
    progress: function (p) {
      if (!api) return;
      var t = A.reduced ? 1 : Math.min(1, Math.max(0, (p - .08) / .34)), e = 1 - Math.pow(1 - t, 3);
      api.tilt.style.transform = t >= 1 ? '' : 'translateY(' + ((1 - e) * 26).toFixed(1) + 'px) rotateX(' + ((1 - e) * 10).toFixed(2) + 'deg)';
      api.tilt.classList.toggle('is-tilting', t < 1);
    },
    resize: function () { if (api) api.resize(); },
    reducedChange: function () { if (api) api.redraw(); }
  });
  var api = null;
})();
