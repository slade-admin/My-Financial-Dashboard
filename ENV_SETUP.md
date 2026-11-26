# Track-suite Setup

This repository currently supports PostgreSQL persistence, authentication,
manual transactions, M-Pesa statement/SMS imports, and forwarded bank SMS
ingestion. Bank gateway, payment, eTIMS, and AI credentials are not wired into
this application yet.

## Environment

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5433/financial_dashboard_personal
TEST_DATABASE_URL=postgresql://postgres:testpassword@localhost:5434/financial_dashboard_test
```

Do not add bank or payment credentials yet. SMS ingestion uses per-user tokens
generated from the Settings page.

## Database with Docker

On Windows, start Docker Desktop with Linux containers enabled. The database is
PostgreSQL running inside Docker. Run these commands from the repository root:

```powershell
docker compose up -d --wait postgres
docker compose ps postgres
```

The compose file binds PostgreSQL to loopback host port `5433`; the application runs
on the host, so it must use `localhost:5433`. If the application itself runs
inside Docker, use `postgres:5432` instead.
An already-running container keeps its previous port binding until explicitly
recreated. Do not recreate the personal service or change firewall exposure as
part of testing; plan any such change separately after a verified backup.

For first-time personal setup, create the separate empty database once:

```powershell
docker compose exec -T postgres psql -U postgres -d postgres -c "CREATE DATABASE financial_dashboard_personal;"
```

If it already exists, preserve it; never drop it to rerun setup. The original
`financial_dashboard` database remains available and is not the personal
application target. Both databases use the existing persistent `pgdata` volume.
This is logical separation, not a backup.

After cloning, install dependencies with `npm ci`. For an existing personal
database, first create and verify an encrypted backup as described below.
Apply migrations from the host only after confirming `DATABASE_URL` names
`financial_dashboard_personal`:

```powershell
npm run migrate:up
```

The migration commands load `.env.local`, then `.env`; explicitly exported
environment variables take precedence, just as they do for the other scripts.
Run the full migration chain, not `schema.sql` alone.

To preview pending migrations without applying them:

```powershell
npm run migrate:up -- --dry-run
```

If the database already contains migrations from a newer branch, preserve it.
Do not run `migrate:down` or delete its volume to make this branch match it; use
the disposable test service for clean-branch validation.

For an authentication failure (`28P01`), check the username/password in
`DATABASE_URL` against the credentials used when the Docker volume was first
created. Changing Compose environment values does not change an existing
database user's password. Do not wipe a volume to fix a connection string.

Start the application:

```powershell
npm run dev -- --hostname 127.0.0.1
```

Open `http://localhost:3000/signup`, create your user, then add your first
financial account under Accounts & Wallets. Do not run `seed:demo` against your
personal database; your own user should start without demo records.

For a different port, use `npm run dev -- --hostname 127.0.0.1 --port 9000`.
Restart the development server after editing `.env.local`.
The npm `dev` and `start` scripts already default to `127.0.0.1`; the explicit
hostname is optional. This is intentionally laptop-local, not a phone endpoint.

To stop the app, press `Ctrl+C` in its terminal. To stop PostgreSQL while keeping
all records:

```powershell
docker compose stop postgres
```

Use `docker compose up -d --wait postgres` to start it again. Never use
`docker compose down -v` for routine startup, shutdown or troubleshooting.

SMS tokens can be managed at `/settings/ingest`. Phone forwarding requires a
phone-accessible endpoint; the laptop's `localhost` address is not reachable
from a phone. Do not expose the database port or simply bind the app to every
network interface to work around this. If remote forwarding is intentionally
enabled later, use trusted HTTPS and per-user bearer tokens. Configure the phone
to retain undelivered alerts, retry network/`503` failures with backoff, and keep
the original message, sender and timezone-qualified `receivedAt` unchanged.
`200`/`201` acknowledge delivery; `202` means review in the application, not
repeated delivery. Other `4xx` responses need review rather than blind retries.
Never put tokens or financial messages in shared screenshots/logs.

Under Accounts & Wallets, configure the trailing account digits shown in bank
SMS. Use M-Pesa Import to preview files/text, review every warning and confirm
selected rows. Previewing never changes balances. History contains pending
phone alerts and confirmed/reversed batch audits. Undo requires a balance-change
preview and confirmation; it preserves existing duplicates, later transactions
and voided source records. See README for supported formats and API contracts.
Do not delete preview/audit rows as filesystem cleanup. The import migration
deliberately refuses rollback once it would remove import history.

## Financial exports and account recovery

**Settings > Download financial data (JSON)** downloads your entire financial ledger
and retained import/change history as JSON, including reversed entries and retired
budgets. It is user-scoped, has no transaction-page cap, and excludes passwords,
sessions, SMS tokens and login attempts. It is an **unencrypted** financial copy:
choose a private location outside OneDrive/shared folders and remove unwanted
downloads. This format is for inspection/portability, not automatic reimport or
complete database recovery.

If you forget the application password but still control the Windows account
and database credentials, run from your own interactive terminal:

```powershell
npm run account:recover
```

Enter the sign-in email, explicitly type `RESET`, then enter/repeat a new hidden
password. Recovery atomically revokes only that user's sessions, SMS tokens and
login lockout, without changing financial data. Sign in again and issue new
phone tokens if needed. No password is passed in command arguments, and no
email-reset service is configured. Anyone with database-owner access can perform
this recovery; secure the laptop, `.env.local` and database credentials.

## Encrypted backups and restoration

These are opt-in operational steps, **not actions performed by tests or by
starting the app**. Personal data has not been migrated or backed up, and no
scheduled task is enabled by this implementation.

Backups stream a complete PostgreSQL custom archive through AES-256-GCM
encryption. No plaintext dump is written. Full backups contain all application
users' data and authentication records, unlike the financial JSON export.
Only successfully completed archives receive the `.finbackup` extension;
interrupted `.partial` files are not usable backups.

### Key and tool setup

Choose absolute paths outside this repository, OneDrive and any other synced or
shared folder. Keep the key outside the backup directory. For example, use the
current Windows user's local application-data directory:

```powershell
$env:BACKUP_DIRECTORY = Join-Path $env:LOCALAPPDATA 'TrackSuite\Backups'
$env:BACKUP_KEY_FILE = Join-Path $env:LOCALAPPDATA 'TrackSuite\Keys\dashboard.backup-key'
npm run backup:key -- "$env:BACKUP_KEY_FILE"
```

Key generation refuses to overwrite a file and restricts its Windows ACL to the
current user. Keep a separate offline key copy, separate from archived backups.
**Losing the key makes backups unrecoverable; anyone with both can read them.**
Do not regenerate it when moving/restoring an existing backup.

Use PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) matching the server
major version, or reuse the running personal PostgreSQL 16 container's tools:

```powershell
$env:PG_TOOLS_CONTAINER = 'financial_dashboard_db'
npm run backup:check
```

Docker must be running for container tools. Unset `PG_TOOLS_CONTAINER` to use
native tools on `PATH`. Backup/restore cross-check the database name and server
startup identity through both connections, refusing a container that points at
another server. `backup:check` checks the key, paths and tool availability only;
it does not connect to or back up the database.

For later scheduled runs, persist the **resolved absolute paths** in your ignored
`.env.local`, alongside the intended `DATABASE_URL`:

```env
BACKUP_DIRECTORY=C:\Users\<WindowsUser>\AppData\Local\TrackSuite\Backups
BACKUP_KEY_FILE=C:\Users\<WindowsUser>\AppData\Local\TrackSuite\Keys\dashboard.backup-key
PG_TOOLS_CONTAINER=financial_dashboard_db
```

Replace `<WindowsUser>`; do not put `$env:LOCALAPPDATA` or `%LOCALAPPDATA%` in
this file because standalone scripts do not expand those expressions. Keep
secrets out of Git and avoid exporting a different `DATABASE_URL` in the
terminal used for personal operations.

### Backup and restore drill

When intentionally activating personal protection, confirm the configured
database and take the first backup **before applying pending migrations**:

```powershell
npm run backup
```

The command reports the completed encrypted archive path and never deletes older
copies. Check disk space, copy verified encrypted archives off the laptop, and
retain multiple recovery points. There is no automatic rotation/deletion.

For a restore drill, select an archive you created and explicitly set an
administrative connection to an existing control database on the intended
restore server. Prefer a separate recovery server. The role needs `CREATEDB`:

```powershell
$env:RESTORE_DATABASE_URL = 'postgresql://postgres:<password>@localhost:5433/postgres'
npm run backup:restore -- 'C:\PrivateBackups\<completed-file>.finbackup'
Remove-Item Env:\RESTORE_DATABASE_URL
```

Replace the example password/path; keep the real connection string in private
configuration rather than shared shell history. If restoring to another server,
unset/change `PG_TOOLS_CONTAINER` to match that server.

The whole archive is authenticated **before any database connection or creation**.
Restore always creates a fresh `finance_restore_<random>` database; it never
replaces an existing database or switches the application automatically. A failed
restore removes only its own new database. Restored sessions, SMS tokens and
login attempts are cleared, so old sessions/tokens cannot resume; financial
records, users, passwords and history are retained. PostgreSQL dumps can execute
database code: restore only trusted archives you created, not arbitrary files.

Verify the new copy using its reported database name and a separately launched
loopback application instance: compare wallet balances, counts, net worth,
monthly expenses/budgets and retained history with the source/export. Keep
normal operation pointed at the source during a drill. Only after verification
and an explicit decision should you stop the app, change `DATABASE_URL`, apply
any needed migrations to that copy, restart and sign in again. Reissue SMS
tokens and update forwarding configuration after a real cutover. Retain the old
database and backup until satisfied; remove only explicitly identified drill
databases when finished.

### Optional daily Windows task

Only after a successful manual backup and restore, preview registration:

```powershell
npm run backup:schedule -- -Time 20:00 -WhatIf
```

This checks configuration and prints the proposed operation without registering
anything. To intentionally enable it later, run the same command **without**
`-WhatIf`. The task name is `FinanceDashboardBackup-<project-path-hash>`; an
existing task is never silently replaced. It runs as the current Windows user,
only while signed in, with credentials/key paths loaded from `.env.local`, not
task arguments. Moving the repository or Node installation requires reviewing
the task's paths.

The laptop must be available, with PostgreSQL/Docker running and the key/storage
accessible. Missed runs start when available, not while the laptop is off.
Inspect Task Scheduler's **Last Run Result** and verify newly dated completed
archives regularly; registration alone is not proof of backup. Manage retention
and off-device copies deliberately. No personal task was registered during
Phase 5/6 testing.

## Validation

Use the separate test service, not the normal `postgres` service:

```powershell
docker compose --profile test up -d --wait postgres-test
```

It listens only on localhost port `5434`, uses temporary storage, and is not
started by a normal `docker compose up -d`.

Set the test connection in PowerShell, leaving `DATABASE_URL` unchanged:

```powershell
$env:TEST_DATABASE_URL = "postgresql://postgres:testpassword@localhost:5434/financial_dashboard_test"
npm run verify
```

Alternatively, add `TEST_DATABASE_URL` to your ignored `.env.local`.
`npm run verify` runs strict input tests, database integration tests, SMS parser
tests, ESLint, the production build, a standalone TypeScript check, and the
first-run HTTP smoke test sequentially.

Database-test safeguards:

- `TEST_DATABASE_URL` is mandatory; there is no fallback to the application's URL.
- Its database name must end in `_test`, and it must not identify the application database.
- Connection overrides that could redirect tests to another database are rejected.
- Each test file creates its own `finance_test_<random>` database, applies the full migration chain, and uses newly created users/accounts.
- The test connection's role needs `CREATEDB` permission. The test-only Docker service provides this; do not grant it to an application role just to run tests.
- Pools are closed and only the invocation's temporary database is dropped in `finally`, on success or failure. No personal transactions, balances, users, or tokens are modified.

Run individual checks with `npm run test:persistence`, `npm run test:dates`,
`npm run test:imports`, `npm run test:workflows`, or `npm run test:ingest-token`. `npm run test:safety` and `npm run test:sms`
do not need PostgreSQL.

`npm run test:startup` requires a production build and the test service. It
starts the actual application on an available loopback port, signs up a
test-only user, creates an account, logs out/in, restarts the server, and checks
that the account and session persist. Servers and the disposable database are
cleaned up afterward. This is HTTP integration coverage, not browser automation.

Coverage includes exact income/expense balances, concurrent duplicate delivery,
rollback after insert or balance-update failures, user isolation, verified
net-worth totals, paired-account transfers and fees, reconciliation, reporting
beyond 500 entries, Nairobi date boundaries independent of host timezone, and
ingest-token ownership/revocation. Upgrade coverage verifies that legacy balances
and unpaired transfers are preserved. HTTP coverage also exercises transfer,
fee and reconciliation API wiring, plus preview/confirmation/retry/undo and
phone-review API contracts. Phase 4 coverage includes versioned corrections,
linked-fee replacement, corrected import undo, retained reversal history, monthly
budget actuals over 500 rows, pagination/filtering, profile updates and expired
cookie cleanup. Import coverage includes quoted/multiline CSV,
visible rejected rows, stable bank identifiers, stale-preview conflicts,
injected batch failures, retained undo audits and reimport.

For real browser acceptance coverage after a production build:

```powershell
npm exec -- playwright install chromium
npm run test:ui
```

The browser test uses `withTestDatabase`, a separate production server on a
random loopback port and fictional data. It closes the browser and server and
drops only its disposable database. It covers account/transaction/asset/debt/goal
editing, reversal history, custom earmarks/releases, budget actuals, older
transactions, profile/navigation, phone-sized layout and outage/session recovery.
It also drops a response after the server commits an account creation, retries
that save without duplication, and downloads the private financial export.
Chromium installation is a one-time development setup, not an application
runtime dependency.

### Phase 6 acceptance and the personal pilot

The complete automated pilot uses only fictional data and the dedicated test
service. With Docker tools, run:

```powershell
$testContainer = docker compose --profile test ps -q postgres-test
if (-not $testContainer) { throw 'Start the dedicated postgres-test service first.' }
$env:TEST_PG_TOOLS_CONTAINER = $testContainer.Trim()
npm run verify:pilot
```

Set `TEST_DATABASE_URL` as above and install Chromium first. Do not substitute
the personal container. Alternatively, leave `TEST_PG_TOOLS_CONTAINER` unset
and install compatible native PostgreSQL tools. `test:recovery` can be run on its
own after a production build; all source/restored test databases, keys and
archives are temporary.

The independently calculated fixture covers income, expenses, paired transfers,
fees, CSV preview/commit/duplicate handling, corrections, reversals, reconciliation,
asset/debt edits, goal allocations and adjacent calendar months. Its expected
closing bank/mobile/cash balances are **KES 1,361.27 / 268.50 / 89.75**; liquid
cash is **KES 1,719.52**, net worth **KES 1,769.27**, current-month income/expenses
**KES 521.00 / 46.35**, and the food budget actual/remaining **KES 40.50 / -5.50**.

The drill verifies these totals after application restart and encrypted backup
restoration into a different database. It compares all exported financial rows,
rejects wrong keys/tampered files before database access, checks restored
session/token invalidation and usable sequences, and confirms the source ledger
is unchanged. Windows scheduler coverage uses `-WhatIf` only.

Automated success does **not** complete the real personal statement-cycle gate.
After explicitly activating backups and migrating the intended personal database:

1. Use one complete M-Pesa/bank statement cycle and matching opening balances; preview and verify dates, fees, identities and both transfer wallets before committing.
2. Compare closing wallet balances, expense/category/month totals, debts, assets and net worth with statements and an independent calculation. Review pending alerts, legitimate duplicates and transfer pairs.
3. Exercise one correction/reversal, a budget and an earmark/release. Restart the app and confirm the same records/history and balances remain.
4. Download the private export, take an encrypted backup and restore it into a separate database. Verify the copy before any real cutover; never overwrite the live source as a test.
5. Use phone-sized layouts and a complete daily-use cycle. If remote forwarding is explicitly enabled, test a real phone alert, a duplicate, a queued offline delivery and token revocation over HTTPS; otherwise mark remote forwarding not enabled.
6. Resolve every discrepancy and confirm scheduled backups really produce restorable copies before treating the dashboard as the sole financial record.

Personal data access, personal backup scheduling and this real statement-cycle
pilot remain manual opt-in steps; they were not performed by the fictional tests.

Remove only the disposable test service when finished:

```powershell
docker compose --profile test rm --stop --force postgres-test
```

Do not use `docker compose down -v` for test cleanup: it would also affect the
normal database. A forcibly killed test process can leave a temporary database
inside the test service; removing that service discards its temporary storage.

## Deployment

On Vercel, configure a hosted PostgreSQL `DATABASE_URL` and
`NEXT_PUBLIC_APP_URL`. Local Docker PostgreSQL is not reachable by Vercel.
Deploy first, then run `npm run migrate:up` against the hosted database. Keep
`.env.local` out of Git; it is ignored by `.gitignore`.
Remote deployment is optional and is not enabled by local setup. Back up the
hosted database separately; laptop scheduling cannot protect a server it cannot
reach.
