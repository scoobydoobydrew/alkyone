(function () {
  'use strict';
  var A = window.Alkyone;

  /* Two layouts of the same scene: wide (desktop, tablet) and tall (phones). Numbers are scene units. */
  var LAYOUT = {
    wide: { vb: [900, 560], chest: [84.5, 273, 2.2], hand: [677.9, 230, 1.2], patch: [150, 328, 1], ring: [583, 135, 1], link: 'M182 322 C 290 300, 330 150, 556 140' },
    tall: { vb: [500, 700], chest: [47.6, 55.8, 1.5], hand: [314.5, 398, 1.25], patch: [93, 93, 0.85], ring: [215.5, 299.4, 1.05], link: 'M120 100 C 220 100, 150 230, 196 288' }
  };
  var BEAT = 2200, PATTERN = [400, 160, 400, 160, 400, 1200], LOOP = 2720;
  var TEXT = {
    idle: 'Linked. The patch sends a steady heartbeat.',
    routine: 'Routine: one soft buzz. Nothing to do.',
    attention: 'Needs attention: a firm pattern that repeats until you acknowledge it.',
    lost: 'No heartbeat yet. Counting the missed beats.',
    alertlost: 'No heartbeat from the patch. Silence is treated as an alert.',
    ack: 'Acknowledged. The patch and the app are told.',
    lostacked: 'Acknowledged. Still no heartbeat from the patch.'
  };
  var NAME = {
    idle: 'Ring. Linked.', routine: 'Ring. Linked.', ack: 'Ring. Linked.', lost: 'Ring. Waiting for the heartbeat.', lostacked: 'Ring. No heartbeat.',
    attention: 'Ring. Tap to acknowledge the alert.', alertlost: 'Ring. Tap to acknowledge the alert.'
  };

  var api = null;
  window.Alkyone.section('ring', {
    init: function (ctx) {
      var root = ctx.el;
      var $ = function (s) { return root.querySelector(s); };
      var stage = $('#ring-stage'), svg = $('#ring-svg'), path = $('#ring-link-path'), pulse = $('#ring-pulse');
      var btnEvent = $('#ring-event'), btnLost = $('#ring-lost'), ringBtn = $('#ring-ringbtn');
      var statusT = $('#ring-status-text'), beatNote = $('#ring-beatnote'), patNote = $('#ring-patnote'), pat = $('#ring-pat');
      var pips = root.querySelectorAll('.ring-pip'), bars = root.querySelectorAll('.ring-bar');
      var patchG = $('#ring-patch-g'), ringG = $('#ring-ring-g');
      var haloP = patchG.querySelector('.ring-halo'), haloR = ringG.querySelector('.ring-halo');
      var radios = root.querySelectorAll('input[name="ring-kind"]');

      var state = 'idle', lost = false, active = false, timers = [], raf = 0, layoutKey = '';

      function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
      function clearTimers() { timers.forEach(clearTimeout); timers = []; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
      function kind() { for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value; return 'routine'; }
      function buzz(p) { try { if (A.vibrate) A.vibrate(p); } catch (e) {} }
      function stopBuzz() { try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {} stage.classList.remove('is-buzz', 'is-soft'); pat.classList.remove('is-run'); pat.removeAttribute('data-k'); bars.forEach(function (b) { b.classList.remove('is-on'); }); patNote.textContent = 'None playing'; }

      /* layout */
      function layout() {
        var k = window.matchMedia && window.matchMedia('(max-width: 699px)').matches ? 'tall' : 'wide';
        if (k === layoutKey) return; layoutKey = k;
        var L = LAYOUT[k];
        svg.setAttribute('viewBox', '0 0 ' + L.vb[0] + ' ' + L.vb[1]);
        $('#ring-chest-g').setAttribute('transform', 'translate(' + L.chest[0] + ' ' + L.chest[1] + ') scale(' + L.chest[2] + ')');
        $('#ring-hand-g').setAttribute('transform', 'translate(' + L.hand[0] + ' ' + L.hand[1] + ') scale(' + L.hand[2] + ')');
        patchG.setAttribute('transform', 'translate(' + L.patch[0] + ' ' + L.patch[1] + ') rotate(-12) scale(' + L.patch[2] + ')');
        ringG.setAttribute('transform', 'translate(' + L.ring[0] + ' ' + L.ring[1] + ') scale(' + L.ring[2] + ')');
        path.setAttribute('d', L.link);
        ringBtn.style.left = (L.ring[0] / L.vb[0] * 100).toFixed(2) + '%';
        ringBtn.style.top = (L.ring[1] / L.vb[1] * 100).toFixed(2) + '%';
      }

      /* the pulse along the link; under reduced motion the nodes light up in turn instead */
      function light(el, on, warm) { el.classList.toggle('is-lit', !!on && !warm); el.classList.toggle('is-warm', !!on && !!warm); }
      function travel(back, warm, done) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        var from = back ? haloR : haloP, to = back ? haloP : haloR;
        if (A.reduced) {
          light(from, true, warm);
          later(function () { light(from, false); light(to, true, warm); }, 320);
          later(function () { light(to, false); if (done) done(); }, 700);
          return;
        }
        var len = path.getTotalLength(), t0 = performance.now(), dur = warm ? 1000 : 900;
        pulse.setAttribute('opacity', '1');
        light(from, true, warm);
        (function step(now) {
          var t = Math.min(1, (now - t0) / dur), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          var pt = path.getPointAtLength(len * (back ? 1 - e : e));
          pulse.setAttribute('cx', pt.x.toFixed(1)); pulse.setAttribute('cy', pt.y.toFixed(1));
          if (t < 1) { raf = requestAnimationFrame(step); return; }
          raf = 0; pulse.setAttribute('opacity', '0'); light(from, false);
          light(to, true, warm); later(function () { light(to, false); }, 420);
          if (done) done();
        })(t0);
      }

      function setState(s) {
        state = s; root.setAttribute('data-ringstate', s);
        statusT.textContent = TEXT[s];
        ringBtn.setAttribute('aria-label', NAME[s]);
        btnEvent.disabled = lost;
        btnEvent.setAttribute('aria-disabled', lost ? 'true' : 'false');
        btnLost.textContent = lost ? 'Restore signal' : 'Simulate lost signal';
        btnLost.setAttribute('aria-pressed', lost ? 'true' : 'false');
        if (A.announce) A.announce(TEXT[s], { assertive: s === 'attention' || s === 'alertlost' });
      }
      function setPips(n) { pips.forEach(function (p, i) { p.classList.toggle('is-on', i < n); }); }

      /* the buzz */
      function playBars(att) {
        pat.setAttribute('data-k', att ? 'attention' : 'routine');
        pat.classList.remove('is-run'); void pat.offsetWidth; pat.classList.add('is-run');
        bars.forEach(function (b) { b.classList.remove('is-on'); });
        var seq = att ? [[1, 0, 400], [2, 560, 960], [3, 1120, 1520]] : [[0, 0, 120]];
        seq.forEach(function (s) { later(function () { bars[s[0]].classList.add('is-on'); }, s[1]); later(function () { bars[s[0]].classList.remove('is-on'); }, s[2]); });
        patNote.textContent = att ? 'Three firm buzzes, repeating' : 'One soft buzz';
      }
      function buzzOnce(att) {
        stage.classList.remove('is-buzz', 'is-soft'); void stage.offsetWidth;
        stage.classList.add(att ? 'is-buzz' : 'is-soft');
        light(haloR, true, att);
        playBars(att);
        buzz(att ? PATTERN : [120]);
      }
      function loop() { if (state !== 'attention' && state !== 'alertlost') return; buzzOnce(true); later(loop, LOOP); }

      /* flows */
      function goIdle() {
        clearTimers(); stopBuzz(); light(haloP, false); light(haloR, false);
        lost = false; setState('idle'); setPips(3); beatNote.textContent = 'Heard just now';
        if (active && !A.reduced) later(ping, 1400);
      }
      function ping() {
        if (state !== 'idle' || !active) return;
        travel(false, false, null); setPips(3); beatNote.textContent = 'Heard just now';
        later(ping, BEAT);
      }
      function simulateEvent() {
        if (lost) return;
        clearTimers(); stopBuzz(); light(haloP, false); light(haloR, false);
        var att = kind() === 'attention';
        setState(att ? 'attention' : 'routine');
        travel(false, true, function () {
          if (att) loop();
          else { buzzOnce(false); later(function () { if (state === 'routine') { stopBuzz(); goIdle(); } }, 2100); }
        });
      }
      function acknowledge() {
        if (state !== 'attention' && state !== 'alertlost') return;
        var wasLost = lost;
        clearTimers(); stopBuzz(); light(haloR, false);
        setState('ack');
        travel(true, false, function () {
          later(function () { if (wasLost) { setState('lostacked'); } else goIdle(); }, 1900);
        });
      }
      function toggleLost() {
        clearTimers(); stopBuzz(); light(haloP, false); light(haloR, false);
        if (lost) { lost = false; goIdle(); if (active && !A.reduced) { clearTimers(); later(ping, 200); } return; }
        lost = true; setState('lost'); setPips(3); beatNote.textContent = 'Last one heard';
        var words = ['One missed', 'Two missed', 'Three missed'];
        [0, 1, 2].forEach(function (i) {
          later(function () {
            setPips(2 - i); beatNote.textContent = words[i];
            if (i === 2) { setState('alertlost'); loop(); }
          }, BEAT * (i + 1));
        });
      }

      btnEvent.addEventListener('click', simulateEvent);
      btnLost.addEventListener('click', toggleLost);
      ringBtn.addEventListener('click', acknowledge);

      layout();
      var onSize = function () { layout(); };
      if (A.onResize) A.onResize(onSize);

      api = { enter: function () { active = true; if (state === 'idle') goIdle(); }, leave: function () { active = false; clearTimers(); stopBuzz(); light(haloP, false); light(haloR, false); lost = false; setState('idle'); setPips(3); beatNote.textContent = 'Heard just now'; }, reset: function () { goIdle(); } };
    },
    enter: function (ctx) { if (api) api.enter(); },
    leave: function (ctx) { if (api) api.leave(); },
    reducedChange: function (r, ctx) { if (api) api.reset(); }
  });
})();
