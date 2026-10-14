# Personal Finance Dashboard

A Next.js-based personal finance dashboard that connects to your bank accounts via Plaid API, organizes expenses into categories, and visualizes spending with clean charts.

## Features

- 🏦 **Bank Connection**: Connect bank accounts using Plaid API
- 📊 **Expense Categorization**: Automatic categorization of transactions
- 📈 **Visual Analytics**: Pie charts and bar charts for spending breakdown
- 💰 **Spending Overview**: Total spending and transaction counts
- 📋 **Transaction History**: View recent transactions

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL
- **Charts**: Recharts
- **Bank Integration**: Plaid API

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- PostgreSQL installed and running
- Plaid account (get free access at https://dashboard.plaid.com/)

### 2. Database Setup

Create a PostgreSQL database:

```bash
createdb finance_dashboard
```

Run the schema:

```bash
psql -U postgres -d finance_dashboard -f schema.sql
```

### 3. Environment Variables

Create a `.env.local` file in the root directory (see `ENV_SETUP.md` for details):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/finance_dashboard
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox
PLAID_REDIRECT_URI=http://localhost:3000/api/plaid/oauth_redirect
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
finance-dashboard/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── plaid/          # Plaid API routes
│   │   │   ├── transactions/   # Transaction data
│   │   │   └── expenses/       # Expense analytics
│   │   └── page.tsx            # Dashboard UI
│   └── lib/
│       ├── db.ts               # Database connection
│       └── plaid.ts            # Plaid client config
├── schema.sql                  # Database schema
└── ENV_SETUP.md                # Environment setup guide
```

## API Endpoints

- `POST /api/plaid/create_link_token` - Create Plaid Link token
- `POST /api/plaid/exchange_public_token` - Exchange public token for access token
- `POST /api/plaid/transactions` - Fetch transactions from Plaid
- `GET /api/transactions` - Get stored transactions
- `GET /api/expenses/by_category` - Get expenses grouped by category

## Notes

- This is a personal project for learning and fun
- Uses Plaid sandbox environment for development
- Currently uses a simplified user model (hardcoded user_id = 1)
- In production, you'd need proper authentication and user management

## Future Improvements

- Add user authentication
- Implement budget tracking
- Add monthly/yearly comparisons
- Support multiple currencies
- Add export functionality
- Mobile-responsive improvements
