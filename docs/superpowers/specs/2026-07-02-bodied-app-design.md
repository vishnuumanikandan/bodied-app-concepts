# 2026-07-02 — BODIED SJ: Concept-01 → Full App (design spec)

## Goal
Turn the approved concept-01 mockup into a usable mobile app of bodiedsj.com. The user
opens it on their phone, installs it to the home screen, and actually books/tracks classes.
Visual language is **concept-01 as-is** (DESIGN.md: "APPROVED by the user as-is; do not
restyle it"). This spec covers only what changes from mockup → app.

## Approach chosen: installable PWA, no build step
- **A. Vanilla static PWA (chosen)** — index.html + assets, manifest, service worker.
  Deploys to the existing GitHub Pages repo unchanged; installs via "Add to Home Screen";
  works offline. Nothing required from the user beyond a push.
- B. React/Vite SPA — build chain and deploy config for zero user-facing gain at this scale.
- C. Expo/React Native — real store app, but requires Apple/Google accounts, certs, builds;
  user asked "let me know if I need to do anything" — this would need a lot.

No backend exists (the studio runs bookings through its site), so bookings are **local to
the device** (localStorage). The app is honest about the boundary: purchases and account
changes link out to bodiedsj.com / phone / email.

## Files
- `index.html` — app shell (DESIGN.md already names concept-01's spec `index.html`)
- `assets/app.css`, `assets/app.js`, `assets/data.js`
- `manifest.webmanifest`, `sw.js` (root scope), `assets/icons/*.png`
- Mockups (`concept-0*.html`, `compare.html`) stay untouched.

## What grows from mockup → app
1. **Real time.** Dates, greeting (buenos días/tardes/noches), week strip, "in 9 hours"
   countdowns all computed from `Date`. Rolling 7-day chips on Classes (TODAY, FRI 3, …).
   Past classes today render dimmed/"ended".
2. **Weekly schedule template** keyed by weekday, only real classes/coaches (PRODUCT.md:
   never invent). Thu/Fri/Sat/Mon from the mockup verbatim; Tue/Wed composed from the same
   real classes; Sun = rest day. Saturday shows the Lil' Bodied youth-soccer band.
3. **Booking lifecycle.** Book → ticket + stamp animation; cancel (free ≥2h out, per the
   mockup's own copy); join/leave waitlist when full; check-in window opens 60 min before
   class, marks attendance. Spot numbers and spots-left are seeded deterministically per
   class instance (stable across reloads) and respond to your own booking.
4. **Persistence.** One localStorage doc (`bodiedsj.app.v1`): profile, bookings keyed
   `YYYY-MM-DD|classId|HH:MM`, coach faves, claimed friend-sticker, theme.
5. **Onboarding (first run).** One poster screen: name + plan (7-day $7 trial default, or
   pick a real member plan). Creates member card no. + since-date. Trial shows "day N of 7".
6. **Sticker book earns itself.** First class, 5AM club (attend a 6:00 AM), 25 bodied,
   Pilates era (5× Pilates Sculpt), Brought a friend (tap-to-claim honor system), and a
   dynamic next-milestone slot (1→5→10→25→50→100, "N to go"). Week-strip stars = days
   actually attended. "47 classes bodied" line becomes the real count.
7. **Website content folded in** (from the live-site extraction in concept-05):
   full pricing table + policy line, 5 real testimonials, studio address/phone, links out
   to bodiedsj.com. Lives in a Pricing sheet (opened from the $7 promo and You → Manage).
8. **Utility sheets.** Help & contact (call, directions, email), payment-method
   (handled by studio, link out), notifications (honest: use Add-to-Calendar). Booked class
   detail gets **Add to calendar** (.ics download) — real reminders with zero backend.
9. **PWA.** Manifest (standalone, portrait, cream/ink theme colors), service worker
   (precache shell, runtime-cache Google Fonts), icons (pink field + chartreuse burst,
   royal outline — the brand stamp). Safe-area insets for installed full-screen mode.
10. **Stage kept.** On desktop the app still presents in the concept-01 phone frame with
    the after-dark toggle; on real phones it's full-bleed.

## Explicitly out (YAGNI / no backend)
Real payments, account sync across devices, push notifications, class capacity shared
between users, admin/coach tooling.
