(function () {
  'use strict';
  var A = window.Alkyone;
  /* what each broken step does: all of it is concept wording, built from the brief */
  var CASES = {
    signal: { title: 'The signal drops', broken: 'send', answer: 'alert', text: 'The heartbeat from the patch stops. Silence is treated as an alert, so the ring buzzes firmly instead of waiting.' },
    off: { title: 'The patch comes off', broken: 'sense', answer: 'alert', text: 'Wear detection notices the patch is no longer on the skin. That is something to tell you about, not a reason to go quiet.' },
    nobody: { title: 'Nobody answers', broken: 'ack', answer: 'alert', text: 'The firm pattern keeps repeating until someone acknowledges it.', note: 'Passing it on to a second person is an idea we want to explore.', exp: true },
    battery: { title: 'The battery runs low', broken: 'sense', answer: 'check', text: 'Self-checking electronics could warn about a weak battery, poor skin contact or a fading signal before they cause trouble.', note: 'This is an idea we want to explore. It is not built.', exp: true }
  };

  window.Alkyone.section('loop', {
    init: function (ctx) {
      var root = ctx.el;
      var $ = function (s) { return root.querySelector(s); };
      var nodes = [].slice.call(root.querySelectorAll('.loop-node')), chips = [].slice.call(root.querySelectorAll('.loop-chip'));
      var card = $('#loop-card'), run = $('#loop-run'), pulse = $('#loop-pulse'), steps = {};
      [].forEach.call(root.querySelectorAll('.loop-steps li'), function (li) { steps[li.getAttribute('data-id')] = li; });
      var selNode = null, selCase = null, unsub = null, len = 0, t0 = 0;

      function clearMarks() { nodes.forEach(function (n) { n.classList.remove('is-broken', 'is-answer'); n.setAttribute('aria-pressed', 'false'); }); }
      function nodeEl(id) { for (var i = 0; i < nodes.length; i++) if (nodes[i].getAttribute('data-id') === id) return nodes[i]; return null; }
      function show(build) {
        card.textContent = ''; build(card); card.classList.remove('is-in'); void card.offsetWidth; if (!A.reduced) card.classList.add('is-in');
      }
      function tag() { var s = document.createElement('span'); s.className = 'exp-tag'; return s; }
      function idle() {
        show(function (c) { var p = document.createElement('p'); p.className = 'loop-card__idle'; p.textContent = 'Tap a step on the loop to read what it does and what happens if it fails.'; c.appendChild(p); });
      }
      function paint() {
        clearMarks(); chips.forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-case') === selCase ? 'true' : 'false'); });
        if (selCase) {
          var k = CASES[selCase], b = nodeEl(k.broken), a = nodeEl(k.answer);
          if (b) b.classList.add('is-broken'); if (a) a.classList.add('is-answer');
          show(function (c) {
            var h = document.createElement('h3'); h.textContent = k.title; c.appendChild(h);
            var p = document.createElement('p'); p.textContent = k.text; c.appendChild(p);
            if (k.note) { var q = document.createElement('p'); q.className = 'loop-fb'; q.textContent = k.note; c.appendChild(q); }
            if (k.exp) c.appendChild(tag());
          });
        } else if (selNode) {
          var n = nodeEl(selNode), li = steps[selNode];
          if (n) n.setAttribute('aria-pressed', 'true');
          show(function (c) {
            var h = document.createElement('h3'); h.textContent = li.querySelector('h3').textContent.replace(/^\d\s·\s/, ''); c.appendChild(h);
            [].forEach.call(li.querySelectorAll('p'), function (p) { c.appendChild(p.cloneNode(true)); });
            if (li.getAttribute('data-exp')) c.appendChild(tag());
          });
        } else idle();
      }
      nodes.forEach(function (n) { n.addEventListener('click', function () { var id = n.getAttribute('data-id'); selCase = null; selNode = selNode === id ? null : id; paint(); }); });
      chips.forEach(function (c) { c.addEventListener('click', function () { var k = c.getAttribute('data-case'); selNode = null; selCase = selCase === k ? null : k; paint(); }); });

      /* the pulse circles the loop: first half (the built steps) bright, second half (exploratory) dim */
      function place(f) {
        var pt = run.getPointAtLength(len * f); pulse.setAttribute('cx', pt.x.toFixed(1)); pulse.setAttribute('cy', pt.y.toFixed(1));
        pulse.style.opacity = f < .5 ? '1' : '.4';
      }
      function start() {
        if (unsub || A.reduced) return;
        t0 = performance.now(); len = run.getTotalLength();
        unsub = A.raf(function () { place(((performance.now() - t0) / 10000) % 1); }, { fps: 30 });
      }
      function stop() { if (unsub) { unsub(); unsub = null; } }
      root.classList.add('is-enhanced'); paint();
      api = { start: start, stop: stop, still: function () { stop(); try { len = run.getTotalLength(); place(0); } catch (e) {} } };
      if (A.reduced) api.still();
    },
    enter: function () { if (api) api.start(); },
    leave: function () { if (api) api.stop(); },
    reducedChange: function (r) { if (!api) return; if (r) api.still(); else api.start(); }
  });
  var api = null;
})();
