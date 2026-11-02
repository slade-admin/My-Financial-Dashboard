# Track-suite Setup

This repository currently supports PostgreSQL persistence, authentication,
manual transactions, M-Pesa statement/SMS imports, and forwarded bank SMS
ingestion. Bank gateway, payment, eTIMS, and AI credentials are not wired into
this application yet.

## Environment

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5433/financial_dashboard
```

Do not add bank or payment credentials yet. SMS ingestion uses per-user tokens
generated from the Settings page.

## Database with Docker

The database is PostgreSQL running inside Docker. Start the container from the
repository root:

```bash
docker compose up -d
docker compose ps
```

The compose file exposes PostgreSQL on host port `5433`; the application runs
on the host, so it must use `localhost:5433`. If the application itself runs
inside Docker, use `postgres:5432` instead.

Apply migrations from the host:

```bash
npm ci
npm run migrate:up
```

For a clean local database only, remove the named volume before restarting:

```bash
docker compose down -v
docker compose up -d
```

This deletes local database data and should not be used against a production
database.

Start the application:

```bash
npm run dev
```

Create an account, add a financial account, then open Settings to create an
SMS ingest token. Send authenticated requests to `POST /api/ingest/sms`.

## Validation

```bash
npm run typecheck
npm run lint
npm run build
npm run test:sms
```

## Deployment

On Vercel, configure a hosted PostgreSQL `DATABASE_URL` and
`NEXT_PUBLIC_APP_URL`. Local Docker PostgreSQL is not reachable by Vercel.
Deploy first, then run `npm run migrate:up` against the hosted database. Keep
`.env.local` out of Git; it is ignored by `.gitignore`.
