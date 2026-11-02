# Track-suite Setup

This repository currently supports PostgreSQL persistence, authentication,
manual transactions, M-Pesa statement/SMS imports, and forwarded bank SMS
ingestion. Bank gateway, payment, eTIMS, and AI credentials are not wired into
this application yet.

## Environment

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://user:password@host:5432/finance_dashboard
```

Do not add bank or payment credentials yet. SMS ingestion uses per-user tokens
generated from the Settings page.

## Database

Create a PostgreSQL database, then apply migrations:

```bash
npm ci
npm run migrate:up
```

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

On Vercel, configure `DATABASE_URL` and `NEXT_PUBLIC_APP_URL` for the
production environment. Deploy first, then run `npm run migrate:up` against
the production database. Keep `.env.local` out of Git; it is ignored by
`.gitignore`.
