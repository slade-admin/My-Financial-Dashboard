# HisaKenya Personal Wealth Dashboard

A personal financial dashboard built with Next.js, React, and TypeScript. It tracks personal accounts, transactions, assets, liabilities, monthly budgets, and savings goals, and supports importing transactions from M-Pesa statements and SMS messages.

## Features on this Branch

- **Net Worth & Metrics**: Computes liquid cash, physical assets, total liabilities, net worth, and monthly cash flow metrics.
- **Accounts & Balances**: View and manage bank, SACCO, mobile money, and investment accounts.
- **Transactions & Categories**: Log income, expenses, and transfers categorized across Kenyan household spending categories.
- **M-Pesa Statement & SMS Import**: Paste and parse M-Pesa SMS confirmations or CSV statement rows into transactions.
- **Assets & Liabilities**: Track estimated values of property, vehicles, and valuables alongside personal, auto, and SACCO loans.
- **Budgets & Goals**: Monitor monthly spending targets and contribute towards personal savings goals.
- **Explicit Demo Seeding**: Fixture data has been decoupled from application source code into a standalone database seed script (`scripts/seed-demo.ts`).
- **Fail-Fast Database Validation**: Requires an explicit `DATABASE_URL` environment variable. Silent fallbacks have been removed so database errors surface immediately.

---

## Prerequisites

- **Node.js**: v20 or newer
- **PostgreSQL**: A running PostgreSQL instance with a database created

---

## Getting Started

### 1. Environment Configuration

Create a `.env` or `.env.local` file in the root directory and specify your PostgreSQL connection string:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/finance_dashboard
```

> **Note**: `DATABASE_URL` is required. The server will fail to start if this environment variable is missing.

### 2. Database Setup

Apply the schema to your PostgreSQL database:

```bash
psql $DATABASE_URL -f schema.sql
```

### 3. Optional: Seed Demo Data

To populate the database with demo accounts, transactions, assets, and goals:

```bash
npm run seed:demo
```

### 4. Running the Application

Start the development server (defaults to port `3000`):

```bash
npm run dev
```

To run on a custom port, pass the `PORT` environment variable:

```bash
PORT=9000 npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) (or your chosen port) in your browser.

---

## Scripts

- `npm run dev`: Starts the Next.js development server (uses `PORT`, defaults to `3000`).
- `npm run build`: Compiles and builds the production application.
- `npm run start`: Starts the Next.js production server (uses `PORT`, defaults to `3000`).
- `npm run typecheck`: Runs TypeScript compiler check (`tsc --noEmit`).
- `npm run seed:demo`: Seeds initial demo fixtures into PostgreSQL.
- `npm run lint`: Runs ESLint checks.
