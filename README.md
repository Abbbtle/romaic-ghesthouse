# Romaic Guesthouse

The website and business dashboard for Romaic Guesthouse, 286 Stateway, Bedelia, Welkom. (The repository's folder is spelled `romaic-ghesthouse`; the business is "Guesthouse".)

- **Public site:** direct bookings (Phase 2).
- **Dashboard at `/admin`:** bookings, the house, content, the books and SARS preparation, for four roles: owner, admin (Weberu), sales and staff.

Built from the Baleka Fitness Site template: Next.js 16 App Router, React 19, TypeScript, Tailwind 4 and zod. Postgres runs on Supabase in production and on PGlite locally. Read `AGENTS.md` before writing Next.js code, and `PRODUCT.md` for who the product is for.

## Getting started

```sh
npm install
npm run dev            # http://localhost:3000, with a local PGlite database in ./data.nosync
```

Open `/admin/setup` to create the first owner, then set up an authenticator app when asked.

## Checks

```sh
npm run lint
npm run typecheck
npm test               # unit and store contract tests (in-memory and PGlite)
npm run test:postgres  # the same store contracts on a real server (needs TEST_DATABASE_URL)
npm run build
npm run check:workspace  # every import resolves from this project's node_modules, never the parent folder's
```

## Security model, in short

- **Permissions:** deny-by-default permissions per role (`src/lib/accounts/access.ts`, mirroring `docs/planning/roles.md`). They're checked in pages, server actions, route handlers and services. Admin never holds a finance permission, and tests check every role × permission pair.
- **Sign-in:** password, then an authenticator code (TOTP) for owner, admin and sales.
- **Sessions:** idle and absolute limits per role, step-up re-confirmation for sensitive changes, and an owner-only reset link by email.
- **Audit log:** append-only and hash-chained (`app.audit_log`).
- **Database:** every table lives in schema `app` with row level security, and Supabase's API roles are locked out. The site runs as the limited role `romaic_app`; migrations run as the owner.
- **Encryption:** secrets are encrypted at rest with AES-256-GCM (`DATA_ENCRYPTION_KEY`).

## Releases

Work reaches production through pull requests only:

1. Build on a feature branch and open a PR into `dev`.
2. Promote by PR, one step at a time: `dev` → `sit` → `uat` → `preprod` → `prod`.

If a release adds a database migration, run `npm run db:migrate` against production before merging into `prod`.

Break-glass owner access (on the owner's written request only):

```sh
npm run admin:reset-password -- --email owner@example.com --operator "Your name" --reason "Why, and who asked"
```
