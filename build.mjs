#!/usr/bin/env node
// Triple Peaks — build-time i18n generator.
// Reads templates/*.html + i18n/<lang>.json, writes one static HTML file per
// language. English → <name>.html, German → <name>-de.html. No dependencies:
// pure Node stdlib, run with `node build.mjs`.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(ROOT, 'templates');
const PARTIALS = join(TEMPLATES, 'partials');
const I18N = join(ROOT, 'i18n');
const ORIGIN = 'https://triplepeaks.coach';
const LANGS = ['en', 'de'];
const SITE_NAME = 'Triple Peaks';
// Social share preview image (Open Graph / Twitter). Absolute URL is required by
// crawlers like LinkedIn/Facebook — without an explicit og:image they scrape a
// random on-page image (e.g. an app screenshot). 1200×630 is the standard card.
const OG_IMAGE = `${ORIGIN}/img/og-image-v2.png`;
const OG_IMAGE_ALT = 'Triple Peaks Coach — Your adaptive coach for endurance sports.';

// Which pages exist in which languages. `de: false` means the German build of a
// page still links to the English file (e.g. features has no German version yet),
// so no dead links. Flip to `true` when a German version ships (Phase 2).
const PAGES = {
  index: { de: true },
  features: { de: true },
  support: { de: true },
  imprint: { de: true },
  terms: { de: true },
  privacy: { de: true },
};

// Resolve a page name to its URL for a given language.
function urlFor(name, lang) {
  const suffix = lang === 'de' && PAGES[name]?.de ? '-de' : '';
  return `${name}${suffix}.html`;
}

// Reciprocal hreflang + x-default block for a translated page (empty otherwise).
function hreflangBlock(name) {
  if (!PAGES[name]?.de) return '';
  const en = `${ORIGIN}/${urlFor(name, 'en')}`;
  const de = `${ORIGIN}/${urlFor(name, 'de')}`;
  return [
    `<link rel="alternate" hreflang="en" href="${en}">`,
    `<link rel="alternate" hreflang="de" href="${de}">`,
    `<link rel="alternate" hreflang="x-default" href="${en}">`,
  ].join('\n  ');
}

// Resolve a page's social-share title/description from its own meta strings,
// falling back to the site-wide description for pages that only define a title
// (e.g. the legal pages). Keeps og:*/twitter:* in lockstep with <title> and the
// meta description, per language, with no duplicated copy.
function socialCopy(name, strings) {
  const titleKey = name === 'index' ? 'meta.title' : `${name}.meta.title`;
  const descKey = name === 'index' ? 'meta.description' : `${name}.meta.description`;
  return {
    og_title: strings[titleKey] ?? strings['meta.title'],
    og_description: descKey in strings ? strings[descKey] : strings['meta.description'],
  };
}

// Build-supplied (non-translation) tokens: language-aware URLs, lang attr, etc.
function buildTokens(name, lang, strings) {
  return {
    lang,
    canonical: `${ORIGIN}/${urlFor(name, lang)}`,
    hreflang: hreflangBlock(name),
    site_name: SITE_NAME,
    og_image: OG_IMAGE,
    og_image_alt: OG_IMAGE_ALT,
    og_locale: lang === 'de' ? 'de_DE' : 'en_US',
    ...socialCopy(name, strings),
    url_home: urlFor('index', lang),
    url_features: urlFor('features', lang),
    url_support: urlFor('support', lang),
    url_imprint: urlFor('imprint', lang),
    url_terms: urlFor('terms', lang),
    url_privacy: urlFor('privacy', lang),
    url_self_en: urlFor(name, 'en'),
    url_self_de: urlFor(name, 'de'),
    active_en: lang === 'en' ? ' class="active"' : '',
    active_de: lang === 'de' ? ' class="active"' : '',
    // Active state for the shared nav partial — set on whichever page is building.
    nav_active_home: name === 'index' ? ' class="active"' : '',
    nav_active_features: name === 'features' ? ' class="active"' : '',
    nav_active_support: name === 'support' ? ' class="active"' : '',
  };
}

// Inline partial includes (one level, no recursion) before token substitution:
//   {{> name}}   -> partials/name.html          (shared chrome: nav, footer)
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

function render(template, tokens) {
  let out = template;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  // Any leftover {{token}} means a template placeholder had no value — bail out
  // rather than shipping a raw token to users.
  const leftover = [...out.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
  if (leftover.length) {
    throw new Error(`unresolved tokens: ${[...new Set(leftover)].join(', ')}`);
  }
  return out;
}

function loadPartials() {
  let files = [];
  try { files = readdirSync(PARTIALS).filter((f) => f.endsWith('.html')); } catch (e) { return {}; }
  return Object.fromEntries(
    files.map((f) => [f.replace(/\.html$/, ''), readFileSync(join(PARTIALS, f), 'utf8')])
  );
}

function main() {
  const strings = Object.fromEntries(LANGS.map((l) => [l, loadStrings(l)]));
  assertKeyParity(strings.en, strings.de);
  const partials = loadPartials();

  const templates = readdirSync(TEMPLATES).filter((f) => f.endsWith('.html'));
  let written = 0;
  for (const file of templates) {
    const name = file.replace(/\.html$/, '');
    const raw = readFileSync(join(TEMPLATES, file), 'utf8');
    for (const lang of LANGS) {
      const template = inlinePartials(raw, partials, lang);
      const tokens = { ...strings[lang], ...buildTokens(name, lang, strings[lang]) };
      const html = render(template, tokens);
      const outFile = join(ROOT, urlFor(name, lang));
      writeFileSync(outFile, html);
      console.log(`  ${lang}  →  ${urlFor(name, lang)}`);
      written++;
    }
  }
  console.log(`\nBuilt ${written} file(s) from ${templates.length} template(s).`);
}

main();
