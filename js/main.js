// Triple Peaks — Main JS

(function () {
  'use strict';

  // --- Mobile nav toggle ---
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  if (toggle && links) {
    function setOpen(open) {
      toggle.classList.toggle('open', open);
      links.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
    }

    toggle.addEventListener('click', function () {
      setOpen(!links.classList.contains('open'));
    });

    // Close nav when a link is clicked
    links.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { setOpen(false); });
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

  // --- "Watch the week move" demo (home page) ---
  // One example half-marathon week and how the coach reshapes it for each
  // scenario: [session type, minutes] per day, Monday first. The "plan" week is
  // also rendered in templates/index.html so the section reads fine without JS;
  // keep the two in step. Labels and coach notes come from the page (i18n).
  const WEEKS = {
    plan:   [['rest', 0], ['tempo', 50], ['rest', 0], ['easy', 45], ['rest', 0], ['long', 105], ['ride', 90]],
    sleep:  [['rest', 0], ['easy', 30], ['tempo', 50], ['easy', 30], ['rest', 0], ['long', 105], ['ride', 90]],
    travel: [['rest', 0], ['tempo', 50], ['travel', 0], ['travel', 0], ['easy', 40], ['long', 105], ['ride', 60]],
    short:  [['rest', 0], ['tempo', 40], ['rest', 0], ['rest', 0], ['rest', 0], ['long', 90], ['ride', 50]],
  };

  function fmtMinutes(m) {
    if (!m) return '';
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (!h) return m + ' min';
    return r ? h + ' h ' + String(r).padStart(2, '0') : h + ' h';
  }

  function initAdapt(root) {
    const controls = root.querySelector('.adapt-controls');
    const days = root.querySelectorAll('.adapt-day');
    const note = root.querySelector('.adapt-note');
    const total = root.querySelector('.adapt-total-num');
    const buttons = root.querySelectorAll('.adapt-btn');
    if (!controls || days.length !== 7 || !note || !total) return;

    const label = function (type) {
      const el = root.querySelector('[data-label="' + type + '"]');
      return el ? el.textContent : type;
    };
    const noteText = function (key) {
      const el = root.querySelector('[data-note="' + key + '"]');
      return el ? el.textContent : '';
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let typing = null;

    function show(key) {
      const week = WEEKS[key];
      if (!week) return;
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.scenario === key)); });

      days.forEach(function (day, i) {
        const type = week[i][0];
        const mins = week[i][1];
        const changed = day.dataset.type !== type || day.style.getPropertyValue('--m') !== String(mins);
        day.dataset.type = type;
        day.style.setProperty('--m', mins);
        day.querySelector('.adapt-what').textContent = label(type);
        day.querySelector('.adapt-dur').textContent = fmtMinutes(mins);
        day.classList.remove('is-changed');
        if (changed && key !== 'plan') {
          void day.offsetWidth; // restart the highlight animation
          day.classList.add('is-changed');
        }
      });
      total.textContent = fmtMinutes(week.reduce(function (n, d) { return n + d[1]; }, 0));

      // A short "typing" beat before the coach answers, like the app's chat.
      clearTimeout(typing);
      if (reduced) { note.textContent = noteText(key); return; }
      note.classList.add('is-typing');
      note.textContent = '';
      typing = setTimeout(function () {
        note.classList.remove('is-typing');
        note.textContent = noteText(key);
      }, 650);
    }

    controls.hidden = false;
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { show(b.dataset.scenario); });
    });
  }

  document.querySelectorAll('.adapt').forEach(initAdapt);

  // --- Sticky CTA (phones) ---
  // Visible while neither the hero button nor the closing CTA/footer is on
  // screen. Android visitors get the web app instead of the App Store link.
  const sticky = document.querySelector('.sticky-cta');
  if (sticky && 'IntersectionObserver' in window) {
    const btn = sticky.querySelector('a');
    if (/Android/i.test(navigator.userAgent) && btn.dataset.androidHref) {
      btn.href = btn.dataset.androidHref;
      sticky.querySelector('.sticky-cta-label').textContent = btn.dataset.androidLabel;
      const logo = btn.querySelector('svg');
      if (logo) logo.remove();
    }
    const watched = document.querySelectorAll('.hero-actions, .closing, .footer');
    const onScreen = new Set();
    sticky.hidden = false;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) onScreen.add(e.target); else onScreen.delete(e.target);
      });
      const show = onScreen.size === 0;
      sticky.classList.toggle('is-visible', show);
      document.body.classList.toggle('has-sticky-cta', show);
    });
    watched.forEach(function (el) { io.observe(el); });
  }

  // --- Scroll reveal ---
  // Content is visible by default; the fade-up only applies once this runs
  // (html.js-reveal), and anything already on screen or without IntersectionObserver
  // support is shown immediately.
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('js-reveal');
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }
})();
