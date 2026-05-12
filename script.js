/* ================== Tweaks panel ================== */
(function () {
  const toggle = document.getElementById('tweaksToggle');
  const panel  = document.getElementById('tweaksPanel');
  const close  = document.getElementById('tweaksClose');
  const root   = document.documentElement;

  function openPanel() {
    panel.classList.add('open');
    toggle.style.display = 'none';
  }
  function closePanel() {
    panel.classList.remove('open');
    toggle.style.display = '';
  }
  toggle.addEventListener('click', openPanel);
  close.addEventListener('click', closePanel);

  // Restore state from localStorage
  try {
    const savedTheme  = localStorage.getItem('ck.theme');
    const savedAccent = localStorage.getItem('ck.accent');
    if (savedTheme)  root.setAttribute('data-theme',  savedTheme);
    if (savedAccent) root.setAttribute('data-accent', savedAccent);
    syncActive('theme',  savedTheme  || 'dark');
    syncActive('accent', savedAccent || 'gold');
  } catch (_) {}

  function syncActive(group, value) {
    document.querySelectorAll(`[data-tweak="${group}"] button`).forEach(b => {
      b.classList.toggle('active', b.dataset.value === value);
    });
  }

  document.querySelectorAll('[data-tweak]').forEach(grp => {
    const key = grp.dataset.tweak;
    grp.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const val = btn.dataset.value;
      root.setAttribute('data-' + key, val);
      try { localStorage.setItem('ck.' + key, val); } catch (_) {}
      syncActive(key, val);
    });
  });
})();

/* ================== Calendly fallback hide ================== */
/* When the iframe injects, hide the "// Calendar loading…" backdrop */
(function () {
  const shell = document.querySelector('.calendly-inline-widget');
  const fallback = document.getElementById('calendlyFallback');
  if (!shell || !fallback) return;

  const observer = new MutationObserver(() => {
    if (shell.querySelector('iframe')) {
      fallback.style.display = 'none';
      observer.disconnect();
    }
  });
  observer.observe(shell, { childList: true, subtree: true });

  // If Calendly never loads (e.g. placeholder URL), keep fallback visible
  setTimeout(() => observer.disconnect(), 8000);
})();

/* ================== Nav scroll polish ================== */
(function () {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const onScroll = () => {
    nav.style.boxShadow = window.scrollY > 8
      ? '0 10px 30px -20px rgba(0,0,0,.7)'
      : 'none';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
