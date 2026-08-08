# BODIED SJ · The App

The full BODIED SJ companion app — [bodiedsj.com](https://bodiedsj.com) in your pocket.
Built from the approved **concept-06 "Studio Standard"** design: the structure of a
boutique-fitness booking app wearing the BODIED SJ skin — cream paper, black type, hot
pink doing every highlight, royal blue as the cooler second voice, and a full after-dark
theme. No photography anywhere: coaches are initials on their brand colour, classes are
flat colour fields.

**[Open the app → index.html](https://vishnuumanikandan.github.io/bodied-app-concepts/)**

## Use it on your phone

1. Open the link above in Safari (iPhone) or Chrome (Android)
2. Tap **Share → Add to Home Screen** (Android: **Install app**)
3. It launches full-screen like a native app, works offline, and remembers everything

## What it does

Five tabs:

- **Home** — what's on at the club, your next reservation with check-in, the stamps you've earned
- **Schedule** — rolling 7-day strip, filters, book / waitlist / cancel, class detail, add a booked class to your calendar (.ics)
- **Pricing** — the nine real plans in four groups, what each includes, and the policy line
- **Shop** — the studio sells nothing online yet, so this is an honest coming-soon state
- **More** — your card, reservations, the stamp book, the four coaches (favourites persist), appearance, and the studio's address, phone, text and email
- Everything is saved on-device (localStorage). No backend: payments & sign-up link out to the studio.

## Design concepts (the originals)

Six interactive mockups live alongside the app — **[open the gallery → compare.html](https://vishnuumanikandan.github.io/bodied-app-concepts/compare.html)**

Concept 01 ("Club Poster") was the app's first skin; concept 06 replaced it and is the
binding system now. The mockups stay frozen as history.

## Docs

- `PRODUCT.md` — brand, tone, real content, strategy (source of truth; local only, gitignored)
- `DESIGN.md` — the approved visual system: tokens, type, motion, bans (local only, gitignored)
- `ARCHITECTURE.md` — code map, state schema, invariants, how to dev & verify
- `CLAUDE-PROJECT-PROMPT.md` — role prompt for the Claude project that prompt-engineers changes to this app
- `docs/superpowers/specs/` — historical design specs
- `tools/gen-icons.mjs` — regenerates the PWA icons (`node tools/gen-icons.mjs assets/icons`)
