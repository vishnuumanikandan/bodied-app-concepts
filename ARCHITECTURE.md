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
| `index.html` | App shell: desktop stage + phone frame, the five screens' static skeleton, the class-detail and More full screens, the bottom sheet, onboarding, tab bar, PWA meta |
| `assets/app.css` | All styles. Concept-06 is the only system; rules the mockup does not have are marked "not in the mockup" and built from its tokens |
| `assets/data.js` | Content only: `STUDIO`, `COACH_COLORS`, `CLASSES`, `WEEK_TEMPLATE`, `COACHES`, `PLANS`, `PLAN_GROUPS`, `PRICING_POLICY`, `CAPACITY`, `MILESTONES`. All content is real, studio-authored, from bodiedsj.com — never invent |
| `assets/app.js` | All logic: state, schedule instances, booking lifecycle, renderers, sheets, onboarding, theme, ICS export, SW registration |
| `sw.js` | Service worker (must stay at repo root for scope) |
| `manifest.webmanifest` | PWA manifest (relative `start_url`/`scope` for the Pages subpath) |
| `assets/icons/` | PNG icons, generated — don't hand-edit; regenerate with `node tools/gen-icons.mjs assets/icons` |
| `concept-01.html` … `concept-06.html`, `compare.html` | Frozen design mockups + gallery. Never modify (except gallery links). `concept-06.html` is the binding one — the app is its port |
| `docs/superpowers/specs/` | Historical design specs |

## Screens

Five tabs, one screen each: **Home** (promos, next reservation, stamps), **Schedule**
(`#screen-classes`, the rolling 7-day strip and the class list), **Pricing** (underline
tabs over the nine plans, plus the link-out to the studio), **Shop** (a permanent
"merch is coming" state), **More** (profile card, sub-screens, appearance, contact).

More opens three full-screen sub-screens from `#more-fs` — *My reservations*, *Stamps &
milestones*, *Meet the coaches* — and the class detail (`#detail`) sits above them, so a
class opened from a reservation returns to the list.

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
- **Sheets**: one bottom sheet (`#confirm-sheet`) carries all of them — filters, the
  booking confirmation, plan details, name & plan — via `openSheet06(html)` /
  `closeSheet06()`. No sheet or More sub-screen pushes a history entry; closing returns
  to the screen that opened it. Only `openDetail(inst)` pushes one entry, and Back at
  any stage of the booking flow dismisses the whole stack.
- **User input** is escaped with `esc()` before hitting `innerHTML` — keep it that way.
- **Theme**: `data-theme="dark"` on `<html>`, persisted only on explicit toggle from
  More → Appearance or the desktop stage toggle; `#dark` deep-links into it. The brand
  fills and `--cream`/`--on-bright` never flip; `--royal` does (see DESIGN.md).
- **Hash routes**: `#home #schedule #pricing #shop #more #detail=<classId>`, `&dark` as a
  flag. The older `#today #classes #coaches #you` still resolve but are aliases —
  `history.replaceState` rewrites them to the canonical hash, adding no history entry.

## Service worker (sw.js)

- Precache list `SHELL` + cache name `CACHE = 'bodied-v2'`. Activation deletes every
  other cache, so a bumped name is the whole update mechanism.
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

- Concept-06 is the only visual system in the app — there is no legacy skin left to
  fall back on.
- Only real content: 6 classes, 4 coaches, 9 real price plans in 4 groups (`PLANS` is one
  flat array; `group` is a field and the Pricing tabs filter on it). Plan ids are frozen —
  `profile.plan` stores them on members' phones. Content is
  studio-authored bodiedsj.com content only, verbatim; no customer-generated content
  (reviews/testimonials/ratings); never invent. Sunday is rest day.
- No payments, accounts, or push notifications in-app — link out to the studio
  (site / phone / email). Bookings are honest about being on-device.
- Reminders = `.ics` calendar export, not notification permissions.
- The mockups and `compare.html` gallery stay working.
