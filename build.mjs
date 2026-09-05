#!/usr/bin/env node
// Triple Peaks — build-time i18n generator.
// Reads templates/*.html + i18n/<lang>.json, writes one static HTML file per
// language (English → <name>.html, German → <name>-de.html) plus sitemap.xml.
// No dependencies: pure Node stdlib, run with `node build.mjs`.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(ROOT, 'templates');
const PARTIALS = join(TEMPLATES, 'partials');
const I18N = join(ROOT, 'i18n');
const DATA = join(ROOT, 'data');
const ORIGIN = 'https://triplepeaks.coach';
const LANGS = ['en', 'de'];
const SITE_NAME = 'Triple Peaks';
// Social share preview image (Open Graph / Twitter). Absolute URL is required by
// crawlers like LinkedIn/Facebook — without an explicit og:image they scrape a
// random on-page image (e.g. an app screenshot). 1200×630 is the standard card.
const OG_IMAGE = `${ORIGIN}/img/og-image-v2.png`;
const OG_IMAGE_ALT = 'Triple Peaks Coach: your adaptive coach for endurance sports.';

// Which pages exist in which languages. `de: false` means only the English file
// is written and the German build links to it, so there are no dead links.
// `sitemap: false` keeps a page out of sitemap.xml; `noindex: true` adds a
// robots meta tag (the 404 page: GitHub Pages serves 404.html for any unknown
// path, so it must not be indexed or translated).
const PAGES = {
  index: { de: true },
  features: { de: true },
  support: { de: true },
  'whats-new': { de: true },
  imprint: { de: true },
  terms: { de: true },
  privacy: { de: true },
  '404': { de: false, sitemap: false, noindex: true },
};

// Output file name for a page in a language.
function fileFor(name, lang) {
  const suffix = lang === 'de' && PAGES[name]?.de ? '-de' : '';
  return `${name}${suffix}.html`;
}

// Site-relative URL for internal links: root-absolute, because GitHub Pages
// serves 404.html at whatever unknown path was requested (/blog/x), where a
// relative "features.html" would resolve to /blog/features.html. The English
// home page is the bare root.
function urlFor(name, lang) {
  if (name === 'index' && lang === 'en') return '/';
  return `/${fileFor(name, lang)}`;
}

// Public absolute URL, used for canonical, hreflang, og:url and the sitemap.
function publicUrl(name, lang) {
  return `${ORIGIN}${urlFor(name, lang)}`;
}

// Reciprocal hreflang + x-default block for a translated page (empty otherwise).
function hreflangBlock(name) {
  if (!PAGES[name]?.de) return '';
  const en = publicUrl(name, 'en');
  const de = publicUrl(name, 'de');
  return [
    `<link rel="alternate" hreflang="en" href="${en}">`,
    `<link rel="alternate" hreflang="de" href="${de}">`,
    `<link rel="alternate" hreflang="x-default" href="${en}">`,
  ].join('\n  ');
}

// Resolve a page's <title> / description from its own meta strings, falling
// back to the site-wide description for pages that only define a title (the
// legal pages). The same pair feeds og:*/twitter:*, so they never drift.
function pageCopy(name, strings) {
  const titleKey = name === 'index' ? 'meta.title' : `${name}.meta.title`;
  const descKey = name === 'index' ? 'meta.description' : `${name}.meta.description`;
  return {
    page_title: strings[titleKey] ?? strings['meta.title'],
    page_description: descKey in strings ? strings[descKey] : strings['meta.description'],
  };
}

// Build-supplied (non-translation) tokens: language-aware URLs, lang attr, etc.
function buildTokens(name, lang, strings) {
  return {
    lang,
    canonical: publicUrl(name, lang),
    hreflang: hreflangBlock(name),
    head_extra: PAGES[name]?.noindex ? '<meta name="robots" content="noindex">' : '',
    site_name: SITE_NAME,
    og_image: OG_IMAGE,
    og_image_alt: OG_IMAGE_ALT,
    og_locale: lang === 'de' ? 'de_DE' : 'en_US',
    ...pageCopy(name, strings),
    url_home: urlFor('index', lang),
    url_features: urlFor('features', lang),
    url_whats_new: urlFor('whats-new', lang),
    url_support: urlFor('support', lang),
    url_imprint: urlFor('imprint', lang),
    url_terms: urlFor('terms', lang),
    url_privacy: urlFor('privacy', lang),
    url_self_en: urlFor(name, 'en'),
    // Language switch; an English-only page (404) sends "Deutsch" to the German home.
    url_self_de: PAGES[name]?.de ? urlFor(name, 'de') : urlFor('index', 'de'),
    active_en: lang === 'en' ? ' class="active"' : '',
    active_de: lang === 'de' ? ' class="active"' : '',
    // Active state for the shared nav partial — set on whichever page is building.
    nav_active_home: name === 'index' ? ' class="active"' : '',
    nav_active_features: name === 'features' ? ' class="active"' : '',
    nav_active_whats_new: name === 'whats-new' ? ' class="active"' : '',
    nav_active_support: name === 'support' ? ' class="active"' : '',
    // Release notes, rendered only where a template asks for them.
    whats_new_body: name === 'whats-new' ? whatsNewBody(lang, strings) : '',
    whats_new_teaser: name === 'index' ? whatsNewTeaser(lang, strings) : '',
  };
}

// --- What's new ---------------------------------------------------------------
// data/release-notes.<lang>.json is the app's public changelog API response for
// that language, fetched by scripts/fetch-release-notes.py (nightly via the
// fetch-release-notes workflow). Shape: [{ version, date,
// highlights: [{ title, description, category, platform }] }], newest first.
const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
};
const OPEN_MONTHS = 2; // most recent months shown expanded; older ones sit behind a toggle

const releaseNotesCache = new Map();
function loadReleaseNotes(lang) {
  if (releaseNotesCache.has(lang)) return releaseNotesCache.get(lang);
  let releases = [];
  try {
    releases = JSON.parse(readFileSync(join(DATA, `release-notes.${lang}.json`), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e; // a malformed file must fail the build, not empty the page
    console.warn(`  (no data/release-notes.${lang}.json, What's new will be empty)`);
  }
  releases = (Array.isArray(releases) ? releases : [])
    .filter((r) => r.version && r.date && r.highlights?.length)
    .sort((a, b) => b.date.localeCompare(a.date) || compareVersions(b.version, a.version));
  releaseNotesCache.set(lang, releases);
  return releases;
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function fmtDate(iso, lang) {
  const [y, m, d] = iso.split('-').map(Number);
  return lang === 'de' ? `${d}. ${MONTHS.de[m - 1]} ${y}` : `${d} ${MONTHS.en[m - 1]} ${y}`;
}
function fmtMonth(iso, lang) {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[lang][m - 1]} ${y}`;
}

function whatsNewBody(lang, strings) {
  const releases = loadReleaseNotes(lang);
  if (!releases.length) return `<p class="release-empty">${esc(strings['whatsnew.empty'])}</p>`;
  const catLabel = {
    new: strings['whatsnew.cat.new'],
    improved: strings['whatsnew.cat.improved'],
    fixed: strings['whatsnew.cat.fixed'],
  };
  // Group by month, newest first (releases are already sorted).
  const months = new Map();
  for (const r of releases) {
    const key = r.date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(r);
  }
  const sections = [...months.entries()].map(([key, rs]) => {
    const articles = rs.map((r) => {
      const items = r.highlights.map((h) => {
        const cat = catLabel[h.category] ? h.category : 'improved';
        return `        <li class="release-item release-item--${cat}">
          <span class="release-tag">${esc(catLabel[cat])}</span>
          <div class="release-text">
            <h3>${esc(h.title)}</h3>
            <p>${esc(h.description)}</p>${h.platform ? `\n            <span class="release-platform">${esc(h.platform)}</span>` : ''}
          </div>
        </li>`;
      }).join('\n');
      return `    <article class="release">
      <header class="release-head"><time datetime="${esc(r.date)}">${fmtDate(r.date, lang)}</time></header>
      <ul class="release-items">
${items}
      </ul>
    </article>`;
    }).join('\n');
    return `  <section class="release-month">
    <h2 class="release-month-title">${fmtMonth(key + '-01', lang)}</h2>
${articles}
  </section>`;
  });
  const open = sections.slice(0, OPEN_MONTHS).join('\n');
  const older = sections.slice(OPEN_MONTHS);
  if (!older.length) return open;
  return `${open}
  <details class="release-older">
    <summary>${esc(strings['whatsnew.older'])}</summary>
${older.join('\n')}
  </details>`;
}

// Home page strip: total shipped since the first entry, plus the three latest titles.
function whatsNewTeaser(lang, strings) {
  const releases = loadReleaseNotes(lang);
  if (!releases.length) return '';
  const all = releases.flatMap((r) => r.highlights.map((h) => ({ date: r.date, title: h.title })));
  const since = fmtMonth(releases[releases.length - 1].date, lang);
  const heading = strings['whatsnew.teaser.h3'].replace('{count}', String(all.length)).replace('{since}', since);
  const latest = all.slice(0, 3).map((h) =>
    `          <li><time datetime="${esc(h.date)}">${fmtDate(h.date, lang)}</time><span>${esc(h.title)}</span></li>`).join('\n');
  return `      <aside class="shipping">
        <div class="shipping-head">
          <span class="eyebrow">${esc(strings['whatsnew.teaser.eyebrow'])}</span>
          <h3>${esc(heading)}</h3>
          <ul class="shipping-list">
${latest}
          </ul>
        </div>
        <a href="${urlFor('whats-new', lang)}" class="btn btn-secondary shipping-link">${esc(strings['whatsnew.teaser.link'])}</a>
      </aside>`;
}

// Inline partial includes (one level, no recursion) before token substitution:
//   {{> name}}   -> partials/name.html          (shared chrome: head, nav, footer)
//   {{>@ name}}  -> partials/name.<lang>.html    (per-language content, e.g. legal bodies)
function inlinePartials(html, partials, lang) {
  html = html.replace(/\{\{>@\s*([\w.-]+)\s*\}\}/g, (_, name) => {
    const key = `${name}.${lang}`;
    if (!(key in partials)) throw new Error(`unknown language partial: ${key}`);
    return partials[key];
  });
  return html.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    if (!(name in partials)) throw new Error(`unknown partial: ${name}`);
    return partials[name];
  });
}

function loadStrings(lang) {
  return JSON.parse(readFileSync(join(I18N, `${lang}.json`), 'utf8'));
}

// Fail loudly if the two locales don't cover exactly the same keys — this is the
// guard that turns translation drift into a build error instead of a silent bug.
function assertKeyParity(a, b) {
  const ak = new Set(Object.keys(a));
  const bk = new Set(Object.keys(b));
  const missingInDe = [...ak].filter((k) => !bk.has(k));
  const missingInEn = [...bk].filter((k) => !ak.has(k));
  if (missingInDe.length || missingInEn.length) {
    const lines = [];
    if (missingInDe.length) lines.push(`  missing in de.json: ${missingInDe.join(', ')}`);
    if (missingInEn.length) lines.push(`  missing in en.json: ${missingInEn.join(', ')}`);
    throw new Error(`i18n key mismatch between en.json and de.json:\n${lines.join('\n')}`);
  }
}

// One pass over the template, so a value is inserted verbatim: no `$&`-style
// replacement patterns and no second substitution inside inserted text (release
// notes flow through here). A {{token}} without a value fails the build rather
// than shipping raw to users.
function render(template, tokens) {
  const missing = new Set();
  const out = template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    if (!Object.hasOwn(tokens, key)) { missing.add(key); return match; }
    return String(tokens[key]);
  });
  if (missing.size) throw new Error(`unresolved tokens: ${[...missing].join(', ')}`);
  return out;
}

function loadPartials() {
  let files = [];
  try { files = readdirSync(PARTIALS).filter((f) => f.endsWith('.html')); } catch (e) { return {}; }
  return Object.fromEntries(
    files.map((f) => [f.replace(/\.html$/, ''), readFileSync(join(PARTIALS, f), 'utf8')])
  );
}

// sitemap.xml: every public page in every language it exists in.
function writeSitemap(names) {
  const urls = [];
  for (const name of names) {
    if (PAGES[name]?.sitemap === false) continue;
    for (const lang of LANGS) {
      if (lang !== 'en' && !PAGES[name]?.de) continue;
      urls.push(publicUrl(name, lang));
    }
  }
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${u}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'sitemap.xml'), xml);
  console.log(`  sitemap.xml (${urls.length} URLs)`);
}

function main() {
  const strings = Object.fromEntries(LANGS.map((l) => [l, loadStrings(l)]));
  assertKeyParity(strings.en, strings.de);
  const partials = loadPartials();

  const templates = readdirSync(TEMPLATES).filter((f) => f.endsWith('.html'));
  const names = [];
  let written = 0;
  for (const file of templates) {
    const name = file.replace(/\.html$/, '');
    names.push(name);
    const raw = readFileSync(join(TEMPLATES, file), 'utf8');
    for (const lang of LANGS) {
      if (lang !== 'en' && !PAGES[name]?.de) continue; // English-only page
      const template = inlinePartials(raw, partials, lang);
      const tokens = { ...strings[lang], ...buildTokens(name, lang, strings[lang]) };
      const html = render(template, tokens);
      const outFile = join(ROOT, fileFor(name, lang));
      writeFileSync(outFile, html);
      console.log(`  ${lang}  →  ${fileFor(name, lang)}`);
      written++;
    }
  }
  writeSitemap(names);
  console.log(`\nBuilt ${written} file(s) from ${templates.length} template(s).`);
}

main();
