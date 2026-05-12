/* ================== Nav scroll shadow ================== */
(function () {
  var nav = document.querySelector('.nav');
  if (!nav) return;
  function onScroll() {
    nav.style.boxShadow = window.scrollY > 8
      ? '0 10px 30px -20px rgba(0,0,0,.7)'
      : 'none';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ================== Calendly fallback ================== */
(function () {
  var shell    = document.querySelector('.calendly-inline-widget');
  var fallback = document.getElementById('calendlyFallback');
  if (!shell || !fallback) return;
  var observer = new MutationObserver(function () {
    if (shell.querySelector('iframe')) {
      fallback.style.display = 'none';
      observer.disconnect();
    }
  });
  observer.observe(shell, { childList: true, subtree: true });
  setTimeout(function () { observer.disconnect(); }, 8000);
})();
