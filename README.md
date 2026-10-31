# OLAM 3.0 — Cloudflare edition

Event registration, QR entry passes and gate check-in for **OLAM 3.0 – A Grand Wedding** (Delta Academy).
A rebuild of the original Expo + FastAPI + MongoDB app on Cloudflare:

| Layer | Tech |
|---|---|
| App (installable on Android & iPhone home screens) | React 19 + Vite + React Router, PWA via `vite-plugin-pwa` (offline cache, manifest, service worker) |
| API | Cloudflare Worker (Hono), every route under `/api` |
| Database | Cloudflare D1 (`olam3-db`, SQLite) — schema in `migrations/0001_init.sql` |
| Hosting | Workers Static Assets: one Worker serves the app *and* the API on the same origin |
| QR | `qrcode` (passes, error correction H with the OLAM logo in the centre), `qr-scanner` (gate camera), `jspdf` (downloadable PDF pass) |
| Reminders | Web Push (VAPID + aes128gcm on WebCrypto, `worker/lib/webpush.ts`) |

No email service: the phone a student registered on remembers them and opens straight to their pass; on another phone they
retrieve it with **email + mobile number**. Reminders go out as push notifications to students who turn them on.

## Features

**Students** — register (one registration per email and per mobile number); the app then reopens on their status / QR pass
("Not you?" clears it); retrieve on another phone with email + mobile; download the pass as a PDF (iPhone: share sheet → Save to Files);
share the pass **as an image** to WhatsApp (share sheet, no link); open the saved pass offline at the venue; turn on push reminders
(iPhone: after Add to Home Screen, iOS 16.4+).

**Coordinators** — see only their own branch; approve / bulk-approve / reject with a reason; attendance log and refused scans;
faculty report; event-day summary; "not arrived yet" list with call + WhatsApp reminder; CSV exports if the admin allows it —
the registrations export follows the current status / branch / search filter, and the attendance log exports check-ins or refused scans.

**Gate scanners** — camera QR scanning with chime / refusal tone and vibration, manual `OLM-XXXXXX` lookup, duplicate-safe check-in,
recent check-ins.

**Super admins** — everything above for all branches, plus: open/close registration, privacy notice and closed message,
event date & venue (printed on passes), branches (add / rename / switch off), **batches (add / rename / reorder / delete)**,
staff accounts (create, CSV permission, deactivate, reset password), activity log, **delete registrations** (single or bulk, e.g. test data;
removes the pass, check-in and push devices too), **push reminders** (Settings → Push Reminders: pick an audience and branch, send).

Security carried over from the original: PBKDF2 password hashing, forced password change for bootstrap/admin-set passwords,
8-hour JWT sessions, per-IP rate limits and sign-in lockout, QR tokens derived with HMAC (only hashes stored, re-approval
invalidates old QR codes), CSV-injection protection, branch scoping enforced on the server.

## First deploy (Windows / macOS / Linux)

Requires Node 20+.

```bash
npm install
npx wrangler login                 # once, opens the browser
npm run deploy                     # builds the app and deploys the Worker
npm run secrets                    # sets JWT_SECRET (random) + INITIAL_ADMIN_PASSWORD (you type it)
npm run vapid                      # once: VAPID key pair for push reminders (both halves stored as Worker secrets)
```

Schema changes live in `migrations/`; apply new ones with `npm run db:migrate` before deploying code that needs them
(`0002_push.sql` adds the `push_subscriptions` table).

The D1 database `olam3-db` already exists on the **cliffincliffin@gmail.com** account with the schema and seed data applied
(branches KALOOR / ELAMAKKARA / MUVATTUPUZHA and batches A1, A2, B1, B2, Preparation, Passed out).
If you ever recreate it: `npx wrangler d1 create olam3-db`, put the new id in `wrangler.jsonc`, then `npm run db:migrate`.

Then open `https://olam-3.<your-subdomain>.workers.dev/staff/login`, choose **Admin**, and sign in with
`INITIAL_ADMIN_EMAIL` (set in `wrangler.jsonc`, currently `cliffincliffin@gmail.com`) and the password you just set.
You'll be asked to choose a new password, then you can create coordinators and scanners under **Settings → Manage Staff**.

Custom domain: Cloudflare dashboard → Workers & Pages → olam-3 → Settings → Domains & Routes → Add custom domain.

### Push to GitHub

```bash
git remote add origin https://github.com/<your-username>/olam-3-cloudflare.git   # create the empty repo first
git push -u origin main
# or, with the GitHub CLI:  gh repo create olam-3-cloudflare --private --source . --push
```

## Local development

```bash
cp .dev.vars.example .dev.vars     # then: npm run vapid -- --print  and paste the two VAPID lines into .dev.vars
npm run db:migrate:local
npm run dev                        # http://127.0.0.1:8787  (app + API with a local D1)
npm run test:api                   # in a second terminal: 18 end-to-end API tests
```

`npm run dev:ui` runs Vite with hot reload on :5173 and proxies `/api` to the Worker on :8787.

## Installing on phones

- **Android (Chrome):** open the site → "📲 Add OLAM 3.0 to your home screen" on the landing page (or ⋮ → Install app).
- **iPhone (Safari):** Share → **Add to Home Screen**. The landing page shows these instructions.

The camera scanner needs HTTPS (any `*.workers.dev` or custom domain is fine).

## Project layout

```
worker/            Cloudflare Worker (Hono)
  index.ts         app, error handling, route mounting
  lib/ctx.ts       auth middleware, roles, shared queries, settings
  lib/util.ts      PBKDF2, HMAC pass tokens, CSV, D1 rate limiting
  lib/webpush.ts   Web Push: VAPID JWT + RFC 8291 payload encryption
  routes/          auth, registrations, scan, reports, push, admin (settings/branches/batches/staff/audit)
src/               React PWA
  pages/           student pages (Landing, Register, Confirmation, MyPass, Pass)
  pages/staff/     Login, ChangePassword, Dashboard, Scanner, Manage, EventSettings, Attendance, Absent, FacultyReport, EventSummary, AuditLog, Notifications
  lib/pass.ts      saved pass + "me" on this device, QR with logo
  lib/pass-image.ts  ticket drawing (PNG share) · lib/pass-pdf.ts PDF ticket · lib/push.ts push opt-in
public/push-sw.js  push + notification-tap handlers (imported into the generated service worker)
migrations/        D1 schema + seed
tests/             API tests (node --test)
```

## API summary

Public: `GET /api/public/{branches,batches,settings}`, `POST /api/registrations`, `POST /api/registrations/lookup` (email + mobile, or email + reference),
`POST /api/pass/verify`, `GET /api/push/public-key`, `POST /api/push/{subscribe,unsubscribe}`.
Staff: `/api/auth/*`, `/api/registrations[/:id[/approve|/reject]]`, `/api/registrations/bulk-approve`, `/api/scan`, `/api/scan/history`,
`/api/attendance`, `/api/stats`, `/api/reports/{faculty,event-day,absent}`, `/api/export/{registrations,faculty,event-day,absent,attendance}.csv`
(`registrations.csv?status=&branch_id=&q=`, `attendance.csv?view=checkins|attempts&branch_id=`).
Super admin: `/api/settings`, `/api/branches`, `/api/batches` (POST, PATCH `/:id` rename, PUT `/order`, DELETE `/:id`), `/api/staff`, `/api/audit`,
`DELETE /api/registrations/:id`, `POST /api/registrations/bulk-delete`, `GET /api/push/stats`, `POST /api/push/send` (40 devices per call; the page repeats with `after`).

Differences from the original: email sending (pass emails, reminders, email queue) was removed by request; students download the
PDF instead. Registrations are now unique per email and per mobile number (previously branch + mobile + name).
Data from the old MongoDB deployment is not migrated automatically.
