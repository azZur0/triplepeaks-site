// Triple Peaks — Main JS

(function () {
  'use strict';

  // --- Mobile nav toggle ---
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  if (toggle && links) {
    toggle.addEventListener('click', function () {
      toggle.classList.toggle('open');
      links.classList.toggle('open');
    });

    // Close nav when a link is clicked
    links.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        toggle.classList.remove('open');
        links.classList.remove('open');
      });
    });
  }

  // --- Language handling ---
  const STORAGE_KEY = 'tp_lang';

  // Remember the language a visitor picks via the footer switch, so the
  // suggestion banner never nags them again.
  document.querySelectorAll('.footer-lang a').forEach(function (link) {
    link.addEventListener('click', function () {
      const lang = /-de\.html(\?|#|$)/.test(link.getAttribute('href')) ? 'de' : 'en';
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    });
  });

  // Suggestion banner: if the visitor's browser is in a language this page is
  // available in but isn't currently showing, offer a one-click switch. No hard
  // redirect — search engines get the right page via hreflang; this only helps
  // direct/root visitors. The alternate URL is read from the page's own hreflang
  // tags, so there's nothing extra to keep in sync.
  const invites = {
    de: { text: 'Diese Seite gibt es auch auf Deutsch.', cta: 'Auf Deutsch ansehen', close: 'Schließen' },
    en: { text: 'This page is also available in English.', cta: 'View in English', close: 'Close' },
  };

  function suggestLanguage() {
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored) return; // visitor already chose

    const current = (document.documentElement.lang || 'en').slice(0, 2);
    const browser = (navigator.language || '').slice(0, 2).toLowerCase();
    if (!browser || browser === current || !invites[browser]) return;

    // Find the alternate URL for the browser's language.
    const alt = document.querySelector('link[rel="alternate"][hreflang="' + browser + '"]');
    if (!alt) return; // this page has no version in that language

    const copy = invites[browser];
    const banner = document.createElement('div');
    banner.className = 'lang-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', copy.text);

    const text = document.createElement('span');
    text.className = 'lang-banner-text';
    text.textContent = copy.text;

    const cta = document.createElement('a');
    cta.className = 'lang-banner-cta';
    cta.href = alt.getAttribute('href');
    cta.textContent = copy.cta;
    cta.addEventListener('click', function () {
      try { localStorage.setItem(STORAGE_KEY, browser); } catch (e) {}
    });

    const close = document.createElement('button');
    close.className = 'lang-banner-close';
    close.type = 'button';
    close.setAttribute('aria-label', copy.close);
    close.textContent = '×';
    close.addEventListener('click', function () {
      try { localStorage.setItem(STORAGE_KEY, current); } catch (e) {}
      banner.remove();
    });

    banner.appendChild(text);
    banner.appendChild(cta);
    banner.appendChild(close);
    document.body.appendChild(banner);
  }

  suggestLanguage();
})();
