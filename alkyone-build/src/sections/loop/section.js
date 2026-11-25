(function () {
  'use strict';
  var A = window.Alkyone;
  var TH = [-90, -30, 30, 90, 150, 210];                       /* where each step sits on the circle, in degrees */
  var IDS = ['sense', 'send', 'alert', 'ack', 'learn', 'check'];
  var NAME = ['Notice', 'Send', 'Alert', 'Acknowledge', 'Learn', 'Self-check'];
  var EXPSTEP = [false, false, false, false, true, true];
  /* the line shown while the pulse goes round on its own: built from the step wording already on the page */
  var IDLE = [
    'Notice. The patch notices what is going on with the baby.',
    'Send. The patch sends it to the ring, with a steady heartbeat.',
    'Alert. The ring buzzes: soft for routine, firm for needs attention.',
    'Acknowledge. Tap the ring and the loop closes.',
    'Learn. Learning what is typical for this baby.',
    'Self-check. Warning about a weak battery or poor contact early.'
  ];
  var IDLE_START = 'One pulse goes round the loop. Break a step to see what the fallback does.';
  /* what each broken step does and where the fallback goes: all concept wording from the brief; "d" is the fallback route in drawing units */
  var CASES = {
    signal: { title: 'The signal drops', broken: 'send', answer: 'alert', d: 'M487 192 C 380 230, 380 370, 487 408',
      text: 'The heartbeat from the patch stops. Silence is treated as an alert, so the ring buzzes firmly instead of waiting.',
      fail: 'Send breaks. The heartbeat from the patch stops, and the link on to Alert goes quiet.',
      fb: 'Fallback: silence is treated as an alert.', go: 'The fallback route carries the alert straight to the ring.', back: 'The loop reconnects. The ring buzzes firmly instead of waiting.' },
    off: { title: 'The patch comes off', broken: 'sense', answer: 'alert', d: 'M300 84 C 390 150, 470 270, 487 408',
      text: 'Wear detection notices the patch is no longer on the skin. That is something to tell you about, not a reason to go quiet.',
      fail: 'Notice breaks. The patch is no longer on the skin, and the link on to Send goes quiet.',
      fb: 'Fallback: wear detection says so instead of going quiet.', go: 'The fallback route takes the message to the ring.', back: 'The loop reconnects. The ring tells you the patch is off.' },
    nobody: { title: 'Nobody answers', broken: 'ack', answer: 'alert', d: 'M300 516 C 320 420, 430 380, 487 408', pill: true, exp: true,
      text: 'The firm pattern keeps repeating until someone acknowledges it.', note: 'Passing it on to a second person is an idea we want to explore.',
      fail: 'Acknowledge breaks. Nobody answers the ring.',
      fb: 'Fallback: the alert repeats until someone acknowledges it.', go: 'The alert goes round again, firm and repeating.',
      extra: 'Passing it on to a second person is an idea we want to explore. It is not built.', back: 'The loop reconnects at Alert and keeps repeating until someone answers.' },
    battery: { title: 'The battery runs low', broken: 'check', answer: 'alert', d: 'M113 192 C 190 330, 330 430, 487 408', exp: true,
      text: 'Self-checking electronics could warn about a weak battery, poor skin contact or a fading signal before they cause trouble.', note: 'This is an idea we want to explore. It is not built.',
      fail: 'Self-check flags a low battery. It is an idea we want to explore.',
      fb: 'Fallback: warn early, before trouble starts.', go: 'The early warning goes to the ring.', back: 'The loop reconnects. This is an idea we want to explore. It is not built.' }
  };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var NS = 'http://www.w3.org/2000/svg';

  window.Alkyone.section('loop', {
    init: function (ctx) {
      var root = ctx.el;
      var $ = function (s) { return root.querySelector(s); };
      var nodes = [].slice.call(root.querySelectorAll('.loop-node')), chips = [].slice.call(root.querySelectorAll('.loop-chip'));
      var segs = [].slice.call(root.querySelectorAll('.loop-seg'));
      var plate = $('.loop-plate'), card = $('#loop-card'), pulse = $('#loop-pulse'), again = $('#loop-again'), pill = $('#loop-pill'), bg = $('#loop-branches');
      var statusT = $('#loop-status-t'), statusX = $('#loop-status-exp'), steps = {};
      [].forEach.call(root.querySelectorAll('.loop-steps li'), function (li) { steps[li.getAttribute('data-id')] = li; });
      var selNode = null, selCase = null, unsub = null;
      var ring = -90;                 /* where the pulse is on the circle (degrees) */
      var seq = null, timer = 0, litIx = -1, lastIdle = -1;

      /* ---- the fallback routes, each drawn as a row of dots ---- */
      var routes = {};
      Object.keys(CASES).forEach(function (key) {
        var k = CASES[key], pth = document.createElementNS(NS, 'path'); pth.setAttribute('d', k.d); pth.style.visibility = 'hidden'; bg.appendChild(pth);
        var len = pth.getTotalLength(), n = Math.max(6, Math.round(len / 14)), dots = [];
        for (var i = 0; i < n; i++) {
          var pt = pth.getPointAtLength(len * (i + .5) / n), c = document.createElementNS(NS, 'circle');
          c.setAttribute('class', 'loop-dot' + (k.exp ? ' loop-dot--exp' : '')); c.setAttribute('r', k.exp ? '3.6' : '3.4'); c.setAttribute('cx', pt.x.toFixed(1)); c.setAttribute('cy', pt.y.toFixed(1)); bg.appendChild(c); dots.push(c);
        }
        routes[key] = { path: pth, len: len, dots: dots };
      });

      /* ---- small helpers ---- */
      function idx(id) { return IDS.indexOf(id); }
      function nodeEl(id) { return nodes[idx(id)] || null; }
      function say(text, exp, ph) {
        statusT.textContent = text; statusX.hidden = !exp; if (ph) root.setAttribute('data-ph', ph); else root.removeAttribute('data-ph');
      }
      function setPulse(x, y, warm) { pulse.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; pulse.classList.toggle('is-warm', !!warm); }
      function onRing(th) {
        var r = th * Math.PI / 180; ring = th; setPulse(300 + 216 * Math.cos(r), 300 + 216 * Math.sin(r), false);
        pulse.style.opacity = (((th + 90) % 360 + 360) % 360) < 240 ? '1' : '.45';
      }
      function lightAt(th) {
        var best = -1, bd = 14;
        for (var i = 0; i < TH.length; i++) { var d = Math.abs((((th - TH[i]) % 360) + 540) % 360 - 180); if (d < bd) { bd = d; best = i; } }
        if (best !== litIx) { if (litIx >= 0) nodes[litIx].classList.remove('is-lit'); litIx = best; if (best >= 0) nodes[best].classList.add('is-lit'); return true; }
        return false;
      }
      function unlight() { if (litIx >= 0) nodes[litIx].classList.remove('is-lit'); litIx = -1; }
      function clearMarks() { nodes.forEach(function (n) { n.classList.remove('is-broken', 'is-answer', 'is-flicker'); n.setAttribute('aria-pressed', 'false'); }); }
      function clearSim() {
        clearTimeout(timer); timer = 0; seq = null; unlight();
        nodes.forEach(function (n) { n.classList.remove('is-broken', 'is-answer', 'is-flicker'); });
        segs.forEach(function (g) { g.classList.remove('is-dim'); });
        Object.keys(routes).forEach(function (k) { routes[k].dots.forEach(function (d) { d.style.opacity = '0'; }); });
        pill.classList.remove('is-on'); root.removeAttribute('data-ph');
      }

      /* ---- the card: the existing explanation text ---- */
      function show(build) {
        card.textContent = ''; build(card); card.classList.remove('is-in'); void card.offsetWidth; if (!A.reduced) card.classList.add('is-in');
      }
      function tag() { var s = document.createElement('span'); s.className = 'exp-tag'; return s; }
      function cardIdle() {
        show(function (c) { var p = document.createElement('p'); p.className = 'loop-card__idle'; p.textContent = 'Tap a step on the loop to read what it does and what happens if it fails.'; c.appendChild(p); });
      }
      function cardCase(k) {
        show(function (c) {
          var h = document.createElement('h3'); h.textContent = k.title; c.appendChild(h);
          var p = document.createElement('p'); p.textContent = k.text; c.appendChild(p);
          if (k.note) { var q = document.createElement('p'); q.className = 'loop-fb'; q.textContent = k.note; c.appendChild(q); }
          if (k.exp) c.appendChild(tag());
        });
      }
      function paint() {
        clearMarks(); chips.forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-case') === selCase ? 'true' : 'false'); });
        again.hidden = !selCase;
        if (selCase) return;
        if (selNode) {
          var n = nodeEl(selNode), li = steps[selNode];
          if (n) n.setAttribute('aria-pressed', 'true');
          show(function (c) {
            var h = document.createElement('h3'); h.textContent = li.querySelector('h3').textContent.replace(/^\d\s·\s/, ''); c.appendChild(h);
            [].forEach.call(li.querySelectorAll('p'), function (p) { c.appendChild(p.cloneNode(true)); });
            if (li.getAttribute('data-exp')) c.appendChild(tag());
          });
        } else cardIdle();
      }

      /* ---- one failure, as a list of phases. Each phase has a length, a line for the status, and at(u) for 0..1 ---- */
      function build(key) {
        var k = CASES[key], b = idx(k.broken), a = idx(k.answer), rt = routes[key], bn = nodes[b], an = nodes[a], seg = segs[b];
        var from = ring, dist = (((TH[b] - from) % 360) + 360) % 360, ph = [];
        ph.push({ dur: dist < 2 ? 250 : Math.max(650, dist / 60 * 750), say: 'The pulse goes round to ' + NAME[b] + '.', ph: 'run', exp: false,
          at: function (u) { onRing(from + dist * ease(u)); lightAt(ring); } });
        ph.push({ dur: 1500, say: k.fail, exp: !!EXPSTEP[b], ph: 'fail',
          enter: function () { unlight(); onRing(TH[b]); bn.classList.add('is-broken'); if (!A.reduced) { bn.classList.remove('is-flicker'); void bn.offsetWidth; bn.classList.add('is-flicker'); } seg.classList.add('is-dim'); },
          at: function () {} });
        ph.push({ dur: 1000, say: k.fb, exp: !!k.exp, ph: 'fallback',
          enter: function () { cardCase(k); },
          at: function (u) { var n = rt.dots.length; rt.dots.forEach(function (d, i) { d.style.opacity = A.reduced ? '1' : clamp(u * n * 1.15 - i, 0, 1).toFixed(2); }); } });
        ph.push({ dur: 1200, say: k.go, exp: !!k.exp, ph: 'fallback',
          enter: function () { setPulse(0, 0, true); },
          at: function (u) { var pt = rt.path.getPointAtLength(rt.len * ease(u)); setPulse(pt.x, pt.y, true); pulse.style.opacity = k.exp ? '.7' : '1'; if (u >= 1) an.classList.add('is-answer'); } });
        if (k.pill) ph.push({ dur: 1700, say: k.extra, exp: true, ph: 'fallback', enter: function () { pill.classList.add('is-on'); }, at: function () {} });
        ph.push({ dur: 1500, say: k.back, exp: !!k.exp, ph: 'back',
          enter: function () { bn.classList.remove('is-broken', 'is-flicker'); seg.classList.remove('is-dim'); onRing(TH[a]); },
          at: function (u) { rt.dots.forEach(function (d) { d.style.opacity = A.reduced ? '0' : (1 - ease(clamp(u * 1.4, 0, 1))).toFixed(2); }); if (u > .6) { pill.classList.remove('is-on'); an.classList.remove('is-answer'); } } });
        return ph;
      }
      function begin(key) {
        clearSim(); selCase = key; paint();
        /* on a phone the diagram sits above the buttons: bring it into view so the sequence can be watched */
        if (plate && window.matchMedia('(max-width: 959px)').matches) {
          var r = plate.getBoundingClientRect();
          if (r.top < 60 || r.bottom > window.innerHeight) plate.scrollIntoView({ block: 'start', behavior: A.reduced ? 'auto' : 'smooth' });
        }
        seq = { key: key, ph: build(key), i: -1, t: 0 };
        advance();
        if (A.reduced) stepTimer();
        else if (!unsub) start();
      }
      function advance() {
        var s = seq; if (!s) return;
        if (s.i >= 0) s.ph[s.i].at(1);
        s.i++;
        if (s.i >= s.ph.length) { finish(); return; }
        var p = s.ph[s.i]; s.t = 0;
        if (p.enter) p.enter(); say(p.say, p.exp, p.ph);
        p.at(A.reduced ? 1 : 0);
      }
      function finish() {
        var k = CASES[seq.key]; seq = null; clearTimeout(timer); timer = 0;
        nodes.forEach(function (n) { n.classList.remove('is-flicker'); });
        onRing(TH[idx(k.answer)]); lastIdle = -1;
        say('Loop closed again. Pick another failure, or run this one again.', false, '');
      }
      /* reduced motion: no travelling, each phase just shows its result and waits */
      function stepTimer() {
        timer = setTimeout(function () { if (!seq) return; advance(); if (seq) stepTimer(); }, 2400);
      }

      /* ---- frame loop: the pulse goes round on its own, or plays the current failure ---- */
      function frame(t, dt) {
        if (seq) {
          var p = seq.ph[seq.i]; seq.t += dt; var u = clamp(seq.t / p.dur, 0, 1); p.at(u);
          if (u >= 1) advance();
          return;
        }
        onRing(ring + dt * 60 / 1800);
        if (lightAt(ring) && litIx >= 0 && !selCase) { lastIdle = litIx; say(IDLE[litIx], EXPSTEP[litIx], ''); }
        else if (litIx < 0 && !selCase) { /* between steps: keep the last line */ }
      }
      function start() { if (unsub || A.reduced) return; unsub = A.raf(frame, { fps: 60 }); }
      function stop() { if (unsub) { unsub(); unsub = null; } }
      function still() { stop(); clearSim(); selCase = null; paint(); onRing(-90); }

      /* ---- controls ---- */
      nodes.forEach(function (n) { n.addEventListener('click', function () {
        var id = n.getAttribute('data-id'); clearSim(); selCase = null; selNode = selNode === id ? null : id; paint();
        say(selNode ? IDLE[idx(id)] : IDLE_START, selNode ? EXPSTEP[idx(id)] : false, '');
        if (!A.reduced && !unsub) start();
      }); });
      chips.forEach(function (c) { c.addEventListener('click', function () {
        var k = c.getAttribute('data-case'); selNode = null;
        if (selCase === k) { clearSim(); selCase = null; paint(); say(IDLE_START, false, ''); if (!A.reduced && !unsub) start(); return; }
        begin(k);
      }); });
      again.addEventListener('click', function () { if (selCase) begin(selCase); });

      root.classList.add('is-enhanced'); paint();
      api = {
        start: start,
        stop: stop,
        still: function () { still(); say(IDLE_START, false, ''); }
      };
      if (A.reduced) api.still(); else onRing(-90);
    },
    enter: function () { if (api) api.start(); },
    leave: function () { if (api) api.stop(); },
    reducedChange: function (r) { if (!api) return; if (r) api.still(); else api.start(); }
  });
  var api = null;
})();
