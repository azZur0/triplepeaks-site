# Triple Peaks — Marketing Site

Marketing site for [triplepeaks.coach](https://triplepeaks.coach).

The app itself lives at [app.triplepeaks.coach](https://app.triplepeaks.coach).

## Pages

- **Home** (`index.html`) — Landing page with feature highlights and CTAs
- **Features** (`features.html`) — Detailed feature breakdown
- **Pricing** (`pricing.html`) — Free trial, Pro subscription, goal-based coaching
- **Changelog** (`changelog.html`) — Public release notes
- **Imprint** (`imprint.html`) — Legal imprint (EU requirement)
- **Privacy** (`privacy.html`) — Privacy policy

## Tech Stack

- Plain HTML/CSS/JS — no build step, no frameworks
- [Inter](https://fonts.google.com/specimen/Inter) font via Google Fonts
- Hosted on GitHub Pages

## Local Development

### Quick start (Python)

```bash
python3 -m http.server 8090
```

Open http://localhost:8090. Manual browser refresh needed after changes.

### With auto-refresh (Node.js)

```bash
npx live-server --port=8090
```

Auto-refreshes the browser on every file save.

## Design

- **Brand colors:** Alpine Green `#145A32`, Orange `#FF6B00`, AI Purple `#7c3aed`
- **Typography:** Inter (matches the app)
- **Icons:** Heroicons-style SVGs + sport icons from the app
- **Responsive:** Mobile-first with breakpoint at 768px

## Deployment

Pushes to `master` automatically deploy via GitHub Pages.
