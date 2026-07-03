# ARCHITECTURE.md — BODIED SJ App

Code map and invariants for anyone (human or AI) changing the app.
Brand/content rules: `PRODUCT.md`. Visual system: `DESIGN.md`.

## Stack: zero-build vanilla PWA

No frameworks, no bundler, no dependencies, no backend. Plain HTML/CSS/JS served
statically. Pushing to `main` deploys to GitHub Pages at
https://vishnuumanikandan.github.io/bodied-app-concepts/ — that is the whole pipeline.
Keep it this way: any change that adds a build step or a dependency is wrong by default.

## File map

| File | Role |
|---|---|
| `index.html` | App shell: desktop stage + phone frame, all four screens' static skeleton, detail sheet, bottom sheet, onboarding overlay, tab bar, PWA meta |
| `assets/app.css` | All styles. Top half is the approved concept-01 system verbatim; app-only surfaces (sheets, onboarding, pricing) extend it with the same tokens |
| `assets/data.js` | Content only: `STUDIO`, `COACH_COLORS`, `CLASSES`, `WEEK_TEMPLATE`, `COACHES`, `PLANS`, `PRICING_POLICY`, `TESTIMONIALS`, `CAPACITY`, `MILESTONES`. All content is real, from bodiedsj.com — never invent |
| `assets/app.js` | All logic: state, schedule instances, booking lifecycle, renderers, sheets, onboarding, theme, ICS export, SW registration |
| `sw.js` | Service worker (must stay at repo root for scope) |
| `manifest.webmanifest` | PWA manifest (relative `start_url`/`scope` for the Pages subpath) |
| `assets/icons/` | PNG icons, generated — don't hand-edit; regenerate with `node tools/gen-icons.mjs assets/icons` |
| `concept-01.html` … `concept-05.html`, `compare.html` | Frozen design mockups + gallery. Never modify (except gallery links) |
| `docs/superpowers/specs/` | Historical design specs |

## Runtime model (app.js)

- **Instance** = one class occurrence on one date, derived on the fly from
  `WEEK_TEMPLATE[weekday]`. Key format: `"YYYY-MM-DD|classId|HH:MM"` (24h, padded).
  `instCache` maps key → instance for DOM handlers.
- **State** = one localStorage doc, key `bodiedsj.app.v1`:
  ```js
  { profile: {name, plan, since:"YYYY-MM-DD", no:"0214"},
    bookings: { "<key>": {status:'booked'|'waitlist'|'attended', spot?, pos?} },
    faves: {Valeria:true, ...}, friendSticker: bool, theme: 'light'|'dark'|null }
  ```
  Changing this schema needs a migration path (or a new versioned key).
- **Spots left** are seeded deterministically: `fnv(key) % 9` (0 = full → waitlist),
  so the studio feels alive but numbers are stable across reloads. Your own booking
  gets `spot = CAPACITY - left + 1`.
- **Check-in window**: 60 min before start → class end; marks `attended`, which feeds
  the week-strip stars, the "N classes bodied" line, and sticker earning
  (`renderStickers`: first class, 6AM club, milestones, Pilates era, claimable friend).
- **Renderers** are small `render*()` functions that write `innerHTML` and rebind
  listeners; `renderAll()` refreshes everything and is cheap. A `setInterval` minute
  tick + `visibilitychange` keep countdowns/ended states honest, including day rollover.
- **Sheets**: `SHEETS[name]()` returns HTML, `openSheet(name)` mounts it (pricing,
  contact, payment, notifications, profile). Class detail is a separate full-screen
  color-drenched sheet (`openDetail(inst)` / `renderDetailState()`).
- **User input** is escaped with `esc()` before hitting `innerHTML` — keep it that way.
- **Theme**: `data-theme="dark"` on `<html>`, persisted only on explicit toggle;
  `--royal`/`--cream` never flip (see DESIGN.md).

## Service worker (sw.js)

- Precache list `SHELL` + cache name `CACHE = 'bodied-v1'`.
- Navigations: network-first, fallback to cached `index.html` (offline).
- Google Fonts: cache-first forever.
- Same-origin assets: **stale-while-revalidate** — installed phones get updates on the
  *next* load after a deploy. If you change the precache list, bump the cache name.

## Local dev & verification

```bash
python3 -m http.server 8471   # from repo root → http://127.0.0.1:8471/
```
- Reset to first-run: DevTools → `localStorage.removeItem('bodiedsj.app.v1')`.
- Before calling any change done, drive the affected flow in a real browser, in both
  themes, and check the ≤560px full-bleed layout (that's the real app; the phone frame
  is a desktop-only stage).
- Time-dependent states (ended classes, check-in window, rest day) depend on the real
  clock — book today's in-progress class to test check-in.

## Invariants (beyond DESIGN.md's)

- Only real content: 6 classes, 4 coaches (+ Coach Hugo youth soccer), 7 real price
  plans, 5 real testimonials. Sunday is rest day.
- No payments, accounts, or push notifications in-app — link out to the studio
  (site / phone / email). Bookings are honest about being on-device.
- Reminders = `.ics` calendar export, not notification permissions.
- The mockups and `compare.html` gallery stay working.
