# CLAUDE.md — OLAM 3.0 (Cloudflare)

Event registration + QR passes + gate check-in. One Cloudflare Worker serves the React PWA (static assets from `dist/`) and the
Hono API under `/api/*` (`run_worker_first: ["/api/*"]`, SPA fallback for everything else). Database: D1 `olam3-db`.

## Commands
- `npm run dev` — build the app, run `wrangler dev` on :8787 with local D1 (needs `.dev.vars`, see `.dev.vars.example`).
- `npm run test:api` — end-to-end API tests against :8787 (`node --test`). Keep them green.
- `npm run typecheck` — app + worker.
- `npm run deploy` — `vite build && wrangler deploy` (account `6d9e3d29acf08caf7195b62ad23d3f77`).
- New schema change → add `migrations/000N_*.sql`, then `npm run db:migrate:local` and `npm run db:migrate` (remote).

## Conventions
- API errors are JSON `{ "detail": "<human message>" }` (thrown via `fail(status, msg)` in `worker/lib/util.ts`); the UI shows `detail` verbatim.
- Validation with zod 4 (`{ error: "..." }` messages); request bodies via `readBody(c.req.raw, Schema)`.
- Roles: `super_admin`, `coordinator` (always scoped to own `branch_id` server-side — use `coordinatorBranch` / `assertBranchAccess`), `scanner`.
- Timestamps are ISO-8601 UTC strings. Booleans are 0/1 in D1 and converted in `userOut` / `regOut`.
- QR pass token = HMAC(JWT_SECRET, `reg_id:version`), never stored; `passes.token_hash` holds HMAC of the token. Re-approval after reject bumps `version`.
- Registrations are unique on `email` (lower-case) and `mobile_key` (last 10 digits).
- Batches are referenced by **name** in `registrations.batch`; renaming a batch updates registrations in the same D1 batch.
- Frontend: plain CSS in `src/styles.css` (navy `#0B192C`, gold `#D4AF37`, ivory `#FDFBF7`; Playfair Display + Inter), mobile-first, 44px touch targets,
  `data-testid` on interactive elements. jsPDF lives only in `src/lib/pass-pdf.ts` (keep it out of other chunks).
