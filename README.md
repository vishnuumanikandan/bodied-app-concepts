# BODIED SJ · The App

The full BODIED SJ companion app — [bodiedsj.com](https://bodiedsj.com) in your pocket.
Built from the approved **concept-01** design (riso-print poster energy: cream paper,
royal-blue ink, hot pink, chartreuse stamps).

**[Open the app → index.html](https://vishnuumanikandan.github.io/bodied-app-concepts/)**

## Use it on your phone

1. Open the link above in Safari (iPhone) or Chrome (Android)
2. Tap **Share → Add to Home Screen** (Android: **Install app**)
3. It launches full-screen like a native app, works offline, and remembers everything

## What it does

- **Today** — real date & greeting, your next ticket with check-in, week stamp strip, poster rail, $7 trial promo
- **Classes** — rolling 7-day schedule, book / cancel / waitlist, class detail sheets, add booked classes to your calendar (.ics)
- **Coaches** — the headliners, favorites persist
- **You** — member card, sticker book that earns itself from real attendance, real pricing, after-dark theme
- Everything is saved on-device (localStorage). No backend: payments & sign-up link out to the studio.

## Design concepts (the originals)

Five interactive mockups live alongside the app — **[open the gallery → compare.html](https://vishnuumanikandan.github.io/bodied-app-concepts/compare.html)**

Concept 01 was approved and became the app.

## Docs

- `PRODUCT.md` — brand, tone, real content, strategy (source of truth)
- `DESIGN.md` — the approved visual system: tokens, type, motion, bans
- `ARCHITECTURE.md` — code map, state schema, invariants, how to dev & verify
- `CLAUDE-PROJECT-PROMPT.md` — role prompt for the Claude project that prompt-engineers changes to this app
- `docs/superpowers/specs/` — historical design specs
- `tools/gen-icons.mjs` — regenerates the PWA icons (`node tools/gen-icons.mjs assets/icons`)
