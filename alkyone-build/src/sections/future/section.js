(function () {
  try { var root = document.getElementById('future'); if (root) root.classList.add('future-enh'); } catch (e) { /* panels stay open */ }
  Alkyone.section('future', {
    init: function (ctx) {
      try {
        var items = ctx.el.querySelectorAll('.future-item');
        items.forEach(function (it) {
          var btn = it.querySelector('.future-btn');
          if (!btn) return;
          btn.addEventListener('click', function () {
            var open = btn.getAttribute('aria-expanded') !== 'true';
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            it.classList.toggle('is-open', open);
          });
        });
      } catch (e) { /* static content stays readable */ }
    }
  });
})();
