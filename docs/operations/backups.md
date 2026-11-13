# Backups and the restore drill

For whoever runs the site for Romaic Guesthouse (Weberu). The hosting plan isn't chosen yet (open question #30 in the planning notes), so this describes what to back up, how often, and how to prove a restore works, without assuming a provider's own backup feature. When the plan is chosen, record here which of the provider's features replace which steps.

## What has to survive

| What | Where | Why it matters |
|---|---|---|
| The database | Postgres, schema `app` (Supabase in production; PGlite in `./data.nosync/pglite` locally) | Bookings, guests, payments, the books, tax records, the audit log, private files (receipts, proof of submission, task photos are stored in the database) |
| `DATA_ENCRYPTION_KEY` (every key in it, old ones too) | The host's environment settings, and a password manager | Without it, authenticator secrets, bank account numbers, tax and employee numbers, and channel links in a backup can't be read. Back the keys up **separately** from the database backups |
| The other secrets | The host's environment settings | `CRON_SECRET`, `VISITOR_KEY_SECRET`, `ADMIN_SETUP_TOKEN`, `RESEND_API_KEY`: replaceable, but note where they live |
| The code | Git (`prod` branch) | Rebuildable from the repository |

Financial records must be kept for five years from when the related return is submitted (SARS, "Record keeping", checked on sars.gov.za on 12 Nov 2026 and held as the tax parameter `records.keep-years`). Keep backups long enough that a lost or damaged record can be recovered within that period.

## Schedule (to agree with the owner)

- **Daily** logical backup of the database, kept for 35 days.
- **Monthly** backup kept for 12 months, and the year-end backup (after the financial year closes) kept for five years.
- **Before every migration** (`npm run db:migrate`), a backup taken by hand.
- Backups are encrypted at rest and stored outside the host that runs the database.
- Targets to confirm with the owner: how much data may be lost at most (one day, with daily backups) and how long the site may be down while restoring.

## Taking a backup

Run as the database's owner role over a direct (not pooled) connection, the same connection `npm run db:migrate` uses (`DATABASE_URL_UNPOOLED`):

```sh
pg_dump --format=custom --no-owner --no-privileges --schema=app \
  --file="romaic-$(date +%Y-%m-%d).dump" "$DATABASE_URL_UNPOOLED"
```

Then encrypt the file before it leaves the machine (for example with `age` or `gpg` to a key only Weberu's operators hold) and copy it to the backup store. `pg_dump` must match or be newer than the server's major version.

Locally, a PGlite database is a folder: stop the dev server and copy `./data.nosync/pglite`.

## Restoring

1. Create an empty database (or a new project) and run the migrations as its owner: `npm run db:migrate` with that database's connection. This creates the roles, grants, row level security and triggers.
2. Restore the data only:

   ```sh
   pg_restore --data-only --disable-triggers --no-owner --schema=app --dbname="$NEW_DATABASE_URL_UNPOOLED" romaic-YYYY-MM-DD.dump
   ```

   `--disable-triggers` is needed because append-only tables (the audit log, journals) refuse writes that aren't inserts, and the balance and period checks would otherwise fire row by row. It needs a superuser or the tables' owner.
3. Point a deployment at the restored database with the same `DATA_ENCRYPTION_KEY` (all keys).
4. Run the checks below before letting anyone use it.

## The restore drill (quarterly, and after any change to the database or host)

Restore the latest backup into a throwaway database, start the app against it (`next start` with that `DATABASE_URL`), sign in as the owner, and check:

- [ ] The migration list matches: `select id from app.schema_migrations order by id` gives the same ids as `src/adapters/postgres/migrations/registry.ts`.
- [ ] Row counts match the source on the day of the backup for `app.bookings`, `app.guests`, `app.payments`, `app.journals`, `app.journal_lines`, `app.audit_log`.
- [ ] Activity (audit log) opens, and its chain check reports the chain intact.
- [ ] Books › Reports › Trial balance on the backup date: debits equal credits, and the bank account's balance matches the source.
- [ ] An encrypted value opens: Tax › Registrations shows a reference's last four digits, Books › Bank shows an account's last four, and the owner's authenticator code works.
- [ ] A private file opens (a receipt or a task photo).
- [ ] Locked months are still locked (Books › Months).

Record the date, the backup file restored, how long it took, and anything that failed, in the operations log. A drill that fails is fixed before the next release.
