# Deployment checklist

For Weberu, before the first production release and each one after. Nothing here has been deployed: hosting, the domain, email and a payment gateway are still to be chosen and approved (open questions #11, #30 and the hosting notes). Work reaches production only through pull requests, `dev` → `sit` → `uat` → `preprod` → `prod` (README, "Releases").

## Decisions needed before the first launch

- [ ] Hosting and region chosen and approved (`vercel.json` currently says `lhr1`; the database's region should match).
- [ ] Domain and the dashboard host (`ADMIN_HOST`, threat model D1): recommended, so `/admin` answers 404 on the public site.
- [ ] Email provider for owner password-reset links and request alerts (Resend is wired; not connected).
- [ ] Payment gateway, or none at launch (#11, #64). The test gateway stays off in production.
- [ ] The client's facts: logo, photos, units per apartment type, prices and booking terms, the Information Officer, retention periods (#57) and the accountant's decisions (#74–#76). Every "To confirm" mark and `data-placeholder` on the site is a fact still owed.

## Environment (from `.env.example`)

- [ ] `NEXT_PUBLIC_SITE_URL` set to the public address.
- [ ] `DATABASE_URL` as the limited runtime role `romaic_app` (pooled connection); `DATABASE_URL_UNPOOLED` as the owner, for migrations only; `DATABASE_POOL_MAX` small (3).
- [ ] `DATA_ENCRYPTION_KEY` generated fresh for production (never the development key), stored in the password manager as well as the host. Never drop an old key: see the note in `.env.example` and open question #84.
- [ ] `VISITOR_KEY_SECRET` set (required on Vercel); `CRON_SECRET` set; `ADMIN_SETUP_TOKEN` set until the first owner exists, then removed.
- [ ] `CLIENT_IP_HEADER` matches what the host puts the visitor's address in.
- [ ] `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` on a verified domain (or both empty: emails then aren't sent).
- [ ] `PAYMENT_GATEWAY` empty or `none`; `TEST_GATEWAY_SECRET` empty.
- [ ] `DESIGN_PREVIEW` empty.

## Database

- [ ] The runtime role `romaic_app` exists with LOGIN and a strong password, before migrating (the migrations grant it what it needs, minus edits to append-only tables).
- [ ] A backup taken (`docs/operations/backups.md`) before running `npm run db:migrate` with the owner connection.
- [ ] `select id from app.schema_migrations order by id` lists every migration in `src/adapters/postgres/migrations/registry.ts` (through `410-reporting-views`).
- [ ] Row level security is on for every table in `app` and the API roles are locked out (the `security` contract tests check this on a real server: `npm run test:postgres`).

## The release itself

- [ ] On the release branch: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:postgres` (against a disposable database), `npm run build`, `npm run check:workspace` all pass.
- [ ] The daily job is scheduled (`vercel.json` crons: `/api/cron/daily` at 01:00 UTC) and answers 401 without `CRON_SECRET`.
- [ ] A full security scan run before launch: `/claude-security` in Claude Code (recommended by the brief), with its high and medium findings fixed.

## After deploying (smoke test, on the production address)

- [ ] Home, Apartments, an apartment, Book (with dates), Policies, Privacy and Contact load; the browser console shows no Content Security Policy errors.
- [ ] Response headers: `Strict-Transport-Security`, `Content-Security-Policy` (with `frame-ancestors 'none'`), `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`.
- [ ] `/admin` on the public host answers 404 if `ADMIN_HOST` is set; on the dashboard host, `/admin/setup` creates the first owner once, then refuses.
- [ ] The owner signs in, sets up an authenticator, and sees Today; a sales and a staff account see only their sections; an admin account sees no Bookings, Books, Tax, Reports' revenue or Privacy.
- [ ] A test booking request arrives in Requests (and the alert email, if email is set up), then is declined; a test booking is made, checked in, checked out, and its income shows in Books.
- [ ] The daily job's first run reports `"ok": true` (check the host's logs the next morning).
- [ ] Backups are running and the first restore drill is booked.

## If it goes wrong

- Roll back the deployment to the previous build on the host. The migrations so far only add tables and columns or widen checks, so the previous build normally runs against the newer schema; check a new migration for this before relying on it, and restore from the pre-migration backup only if data was damaged.
- Note what happened, when and who was affected. If personal data was exposed, follow the breach procedure in the dashboard (Privacy › Breaches) and tell the owner, who is responsible for notifying.
