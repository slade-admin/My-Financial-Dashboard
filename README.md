# Track-suite 

A personal financial dashboard built with Next.js, React, and TypeScript. It tracks personal accounts, transactions, assets, liabilities, monthly budgets, and savings goals, and supports importing transactions from M-Pesa statements and SMS messages.

## Features on this Branch

- **Net Worth & Metrics**: Computes liquid cash, physical assets, total liabilities, net worth, and monthly cash flow metrics.
- **Accounts & Balances**: View and manage bank, SACCO, mobile money, and investment accounts.
- **Transactions & Categories**: Log, correct and reverse entries with retained history; search and paginate the complete ledger using shared Kenyan categories.
- **Reviewed Imports**: Preview M-Pesa CSV and M-Pesa/bank SMS, correct assignments, confirm atomically, and undo imports with retained audit history.
- **Assets & Liabilities**: Track estimated values of property, vehicles, and valuables alongside personal, auto, and SACCO loans.
- **Budgets & Goals**: Create/edit monthly category limits with spending, remaining and overspending indicators; earmark/release custom savings amounts with contribution history.
- **Everyday Maintenance**: Edit accounts, asset valuations, debts and goal targets with reasons and version checks. Settings exposes profile editing, SMS tokens and logout; expired sessions return to login.
- **Data Protection**: Download a complete private financial JSON export; create encrypted PostgreSQL backups, restore into a new database, and optionally configure daily Windows backups.
- **Reliable Local Use**: Loopback-only servers, strict input validation, durable creation retries, actionable database errors and interactive owner password recovery.
- **Explicit Demo Seeding**: Fixture data has been decoupled from application source code into a standalone database seed script (`scripts/seed-demo.ts`).
- **Fail-Fast Database Validation**: Requires an explicit `DATABASE_URL` environment variable. Silent fallbacks have been removed so database errors surface immediately.

---

## Prerequisites

- **Node.js**: v20.11 or newer
- **Docker**: Docker Desktop running with Linux containers on Windows

---

## Getting Started

### 1. Environment Configuration

Create a `.env` or `.env.local` file in the root directory and specify your PostgreSQL connection string:

```env
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5433/financial_dashboard_personal
NEXT_PUBLIC_APP_URL=http://localhost:3000
TEST_DATABASE_URL=postgresql://postgres:testpassword@localhost:5434/financial_dashboard_test
```

> **Note**: `DATABASE_URL` is required. The server will fail to start if this environment variable is missing.

### 2. Local Database with Docker Compose

After cloning, install dependencies with `npm ci`. Start the local PostgreSQL 16
database from PowerShell:

```powershell
docker compose up -d --wait postgres
```

For the first personal setup, create a separate empty database in the existing
persistent PostgreSQL instance:

```powershell
docker compose exec -T postgres psql -U postgres -d postgres -c "CREATE DATABASE financial_dashboard_personal;"
```

Run creation only once; if the name already exists, do not drop or reset it.
The original `financial_dashboard` database is preserved. Both logical databases
share the persistent Docker volume; separation is not a backup.

### 3. Migrations & Schema

Database migrations are managed with `node-pg-migrate` under `migrations/`:

```bash
npm run migrate:up
```

Run the full migration chain. `migrations/schema.sql` is only the initial
financial schema; applying it alone does not create authentication or ingest-token tables.
The migration commands load `.env.local` automatically and honor exported
environment overrides. Use `npm run migrate:up -- --dry-run` to preview changes.
For an existing personal database, first create and verify an encrypted backup
using [the protection guide](ENV_SETUP.md#encrypted-backups-and-restoration).
The Phase 5 migration adds creation-retry keys without changing existing balances.

### 4. Optional: Seed Demo Data

Only in a separate demo database, populate fixture accounts, transactions,
assets and goals:

```bash
npm run seed:demo
```

Skip this step for personal use. Create your own user at `/signup` instead;
tests create and remove their own users without needing demo data.

### 5. Running Tests

Start the separate, disposable test PostgreSQL service:

```powershell
docker compose --profile test up -d --wait postgres-test
```

Then run the complete verification sequence from PowerShell:

```powershell
$env:TEST_DATABASE_URL = "postgresql://postgres:testpassword@localhost:5434/financial_dashboard_test"
npm run verify
```

Tests never fall back to `DATABASE_URL`. Each database test file creates a
randomly named database, applies all migrations, and removes that database in
`finally`, including on assertion failures. No demo seed or personal account is
needed. See [ENV_SETUP.md](ENV_SETUP.md#validation) for safety rules and cleanup.
Verification also starts the production application, exercises signup/login
and account creation, and checks persistence after an application restart.

For browser acceptance coverage, install the test browser once, then run:

```powershell
npm exec -- playwright install chromium
npm run test:ui
```

Run this after `npm run build`, with the same test service and
`TEST_DATABASE_URL`. It exercises the real interface against a disposable
database, including corrections/history, budgets, goal allocations, pagination,
profile/navigation, phone-sized layout, error recovery and expired sessions.
It also retries a server-committed save after losing its response and verifies
that only one account exists.

For the complete fictional acceptance pilot, including encrypted backup and
restoration with PostgreSQL tools, follow
[Phase 6 acceptance](ENV_SETUP.md#phase-6-acceptance-and-the-personal-pilot) and
run `npm run verify:pilot`. This does not replace a real statement-cycle pilot.

### 6. Running the Application

Start the development server (defaults to port `3000`):

```powershell
npm run dev
```

To run on a custom port:

```powershell
npm run dev -- --port 9000
```

Visit [http://localhost:3000](http://localhost:3000) (or your chosen port) in your browser.
Create your user, then add a financial account under Accounts & Wallets.
Both `dev` and `start` bind to `127.0.0.1` by default. Local use does not expose
the application to a phone or the network.

### Personal financial workflow

Use KES accounts only. Enter the balance **before the history being imported**
(usually zero), import all history, then use **Reconcile to statement balance**
on each account. Never enter the current statement balance as an opening balance
and then import older transactions on top of it. Reconciliation records a signed,
dated adjustment with your reason; it does not inflate income or spending.
Use a closing date on or after the latest recorded movement.

Transfers require different owned source/destination wallets and update both
balances atomically. Fees are separate linked expenses, charged once even when
an SMS is retried. Create a cash wallet before importing cash withdrawals or
deposits. Select a counterpart wallet if multiple cash/savings wallets match;
the application refuses ambiguous movements instead of guessing. Loan-draw
messages require manual loan tracking, not automatic expense classification.

Monthly cash flow and category totals use all entries in the current Nairobi
calendar month, not just the transaction list's latest page. Transfer principal,
opening balances and reconciliation adjustments are excluded. Foreign currencies
are rejected, not converted at an invented rate. Existing unpaired transfers or
foreign-currency records are preserved during upgrades and require review.

### Everyday maintenance and history

Back up an existing personal database before `npm run migrate:up`. The everyday
workflow migration adds versions, before/after record history and goal allocation
history, and unifies legacy category names. Existing balances and goal totals
are preserved. It refuses rollback once doing so would remove audit history.

Use **Edit account** for account details and **Edit / Reverse** for transactions.
Corrections replace the old balance effects with the corrected effects atomically,
including both transfer wallets and the linked fee. Fees are edited through
their parent transaction, not independently. Imported entries keep their batch
membership: later batch undo reverses their corrected effects, not their original
preview amounts. Reversals retain records; select **Reversed transactions
(history)** to view their history. All normal balances/reports exclude voided rows.

Edits need a reason, and stale versions are rejected rather than silently
overwritten. **History** shows prior/new values and reasons. Asset valuations
and debt-balance edits do not create cash movements; record actual payments
separately. Account balances are corrected by reconciliation, never overwritten.

Under **Budgets & Goals**, create/edit recurring category limits and choose the
Nairobi spending month. Actuals include every active expense and fee in that month,
not just the latest transaction page. Limits are recurring, not historical
month-specific snapshots. Legacy duplicate budgets are preserved; retire extra
limits rather than merging their amounts silently.

**Earmark / Release & history** accepts custom amounts and dates. Earmarks allocate
existing savings only: they never move money or increase net worth. Releases
correct allocations without deleting history, and cannot make a goal negative.
An opening history entry preserves previously saved totals. Repeated contribution
requests with the same request ID are counted only once.

`GET /api/transactions` accepts `limit` (1-200), `offset`, `search`, `category`,
`accountId`, `transactionType`, `startDate`, `endDate` and `status`
(`active`, `reversed`, `all`; default `active`). It returns transactions, total,
pagination metadata and the active transfer-review count. Full edits use
`PATCH /api/transactions` with `action:"edit"`, `id`, `version`, `reason` and
changed fields. Reversal uses `DELETE` with `id`, `version`, `reason`, `confirm:true`.
`GET /api/history?entity=transaction&id=...&page=0` returns scoped change history;
supported entities also include account, asset, liability, goal and budget.
`GET /api/categories` supplies shared categories plus the user's existing custom names.
Budget CRUD is under `/api/budgets` (`DELETE` retires); goal history is
`GET /api/goals?id=...&page=0`. Contributions use `POST /api/goals` with
`action:"contribute"`, `id`, `version`, UUID `request_id`, signed `amount`, `date`
and optional `note`. Target edits use `PATCH` and cannot overwrite saved totals.

### Protection, recovery and uncertain saves

Under **Settings**, download the financial JSON export for all your accounts,
transactions, assets, debts, budgets, goals and retained change/import history.
It has no page cap and excludes passwords, sessions and SMS tokens. The download
is **unencrypted private financial data**, not a database backup or reimport file;
keep it outside OneDrive/shared folders.

Full recovery uses AES-256-GCM encrypted PostgreSQL backups with a separate
random key. Restore always creates a new database, never overwrites the source,
and clears restored sessions and forwarding tokens. See
[ENV_SETUP.md](ENV_SETUP.md#encrypted-backups-and-restoration) for key creation,
backup, restore verification and optional daily Windows scheduling. Setup is
prepared only: no personal backup task is enabled automatically.

`npm run account:recover` provides interactive, database-owner password recovery
with hidden password entry and explicit confirmation. It revokes that account's
sessions/tokens without changing financial records. There is no email reset
service; protect local database and Windows-account access.

Creation requests for accounts, assets, debts and goals accept an optional UUID
`request_id`. Retrying the same payload/key returns the original record; changing
the payload while reusing the key returns `409`. The interface preserves this key
after an uncertain response. Check the record before starting a different save.
Malformed types, non-finite amounts, impossible dates and unknown enums are
rejected. Database outages return actionable `503` responses rather than success;
restore connectivity and retry, preserving the original request identity.

### Reviewed imports and phone forwarding

Under **M-Pesa Import**, open a local `.csv`/`.txt` file or paste text, then
explicitly select the default account. **Preview without saving** creates only
a draft: it does not change balances or create transactions. Examples only fill
the editor; they are fictional and are never saved automatically.

Review dates, principal, fees, type and wallet assignments before confirmation.
Own-money movements need both wallets; record the paired transfer once and skip
the other wallet's notification. Missing SMS dates are left blank, not guessed
as today. Generic bank alerts, uncertain identities and fee assumptions require
explicit review. Rejected/failed rows stay visible and are counted separately
from duplicates and deliberately skipped rows.

CSV parsing supports quoted commas, escaped quotes, multiline descriptions,
BOM and formatted KES amounts. Use M-Pesa columns `Receipt No.`, `Completion Time`,
`Details`, `Transaction Status`, `Paid In`, `Withdrawn`, optionally `Balance`
and `Fee`/`Transaction Cost`. Headerless input assumes the standard seven-column
layout and requires review. Only successful rows qualify. Limits are 5 MB and
10,000 rows per batch; bank-specific CSV and PDF are not supported.

Confirming saves the selected rows, linked fees and all wallet effects in one
database transaction. A failure saves none of that batch. Confirmation retries
are idempotent. Import history shows pending drafts, outcome counts and audits.
**Preview undo** shows the balance changes; explicit undo reverses only entries
created by that batch, including linked fees. Pre-existing duplicates and later
transactions remain. Original rows are retained as voided audit entries and
excluded from reports; legitimate reimport is possible after undo.

For bank forwarding, set the visible trailing account digits (at least four)
when creating a bank/SACCO account or use **Set bank SMS identifier** on its card.
Alerts match by identifier and institution, not the institution alone.
Ambiguous mapping, identity, dates, fees, loan treatment or classification queue
a draft under **Import history & pending SMS reviews**, without changing balances.
Bank alerts without an issuer reference always require review, even if they
include a time: identical text can describe a retry or a distinct event.
Confirmed transactions can subsequently be corrected under Transactions, with
the original import preview and separate edit history both retained.

`POST /api/ingest/sms` accepts `accountId`, `counterpartAccountId` and an optional
timezone-qualified `receivedAt`. Preserve the original received timestamp on
retries. Responses are `201` saved, `200` duplicate, `202` awaiting review and
`422` unrecognised. Pending retries retain a received count; review whether
identical alerts represent retries or distinct events. A genuinely distinct
bank event can receive an explicit new reference during review.

Local-only operation is the default: a phone cannot reach the laptop's
`localhost`. Enable forwarding only after explicitly setting up an authenticated,
phone-accessible HTTPS endpoint; never expose PostgreSQL or share bearer tokens.
Keep the original message, sender and receipt timestamp in a durable retry queue.
Treat `200`/`201` as acknowledged and `202` as queued for human review, not a
reason to resend. Review `4xx` responses (including `409`); retry network failures
and `503` with backoff and the identical payload. An undelivered alert must remain
visible on the phone until acknowledged.

The session-authenticated statement endpoint no longer imports immediately:
`POST /api/import/statement` with `rawText`, `accountId` and optional `format`
creates a preview. Confirm with `{action:"commit", batchId, rows, confirm:true}`,
where each row has `row`, `decision` (`import`, `duplicate`, `skip`), `reviewed`
and optional corrected `transaction`. `GET` lists history (`?page=0`) or loads
a batch (`?id=...`); append `&reversal=true` for undo effects. `DELETE` accepts
`{action:"discard", batchId}` for drafts or
`{action:"reverse", batchId, confirm:true}` for confirmed batches.

Stop the app with `Ctrl+C`; `docker compose stop postgres` stops the database
without deleting its volume. Do not reset an existing database to fix credentials
or migration differences between branches.

---

## Scripts

- `npm run dev`: Starts the loopback-only development server (uses `PORT`, defaults to `3000`).
- `npm run build`: Compiles and builds the production application.
- `npm run start`: Starts the loopback-only production server (uses `PORT`, defaults to `3000`).
- `npm run typecheck`: Runs TypeScript compiler check (`tsc --noEmit`).
- `npm run verify`: Runs input/database/SMS tests, lint, production build, TypeScript, and HTTP acceptance checks sequentially.
- `npm run verify:pilot`: Also runs browser acceptance and an encrypted backup/restore drill using fictional data.
- `npm run test:database`: Runs guarded, isolated database integration tests.
- `npm run test:safety`: Checks database URL safety guards without requiring PostgreSQL.
- `npm run test:dates`: Checks Nairobi date boundaries and SQL DATE round trips.
- `npm run test:ingest-token`: Checks token ownership, tampering, revocation, and lookup performance.
- `npm run test:sms`: Runs M-Pesa and bank SMS parser checks without PostgreSQL.
- `npm run test:imports`: Checks CSV/SMS previews, atomic batches, reviewed bank forwarding, duplicate handling, ownership and undo in an isolated database.
- `npm run test:startup`: Checks signup/login, account creation, and persistence across a production-server restart in an isolated database.
- `npm run test:inputs`: Checks strict types, money/dates/enums, safe error responses and backup configuration guards.
- `npm run test:protection`: Checks concurrent creation retries, complete private exports, owner recovery and stale reconciliation retries.
- `npm run test:recovery`: Checks independently calculated ledger/report totals, restart, encryption/tamper detection, isolated restoration and scheduler dry-run.
- `npm run backup:key -- "<absolute key path>"`: Creates a private random backup key without overwriting an existing file.
- `npm run backup:check`: Checks paths, key and PostgreSQL tool availability without accessing a database.
- `npm run backup`: Creates an encrypted database backup; never deletes older copies.
- `npm run backup:restore -- "<archive path>"`: Restores into a new database on the explicit `RESTORE_DATABASE_URL` server.
- `npm run backup:schedule -- -WhatIf`: Previews daily Windows task registration; omit `-WhatIf` only when intentionally enabling it.
- `npm run account:recover`: Interactively resets an owner's password and revokes their sessions/SMS tokens.
- `npm run migrate:up`: Runs pending database migrations.
- `npm run migrate:down`: Reverts the last migration.
- `npm run test:persistence`: Checks financial persistence, atomicity, deduplication, user isolation, and transfer reporting in an isolated database.
- `npm run seed:demo`: Seeds initial demo fixtures into PostgreSQL.
- `npm run lint`: Runs ESLint checks.
