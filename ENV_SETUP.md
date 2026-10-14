# Environment Variables Setup

Create a `.env.local` file in the root directory with the following variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/finance_dashboard

# Plaid API Credentials
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox
PLAID_REDIRECT_URI=http://localhost:3000/api/plaid/oauth_redirect

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Getting Plaid Credentials

1. Go to https://dashboard.plaid.com/
2. Sign up for a free account
3. Create a new account in the dashboard
4. Copy your Client ID and Secret
5. Use `sandbox` environment for development

## Database Setup

1. Install PostgreSQL
2. Create a database named `finance_dashboard`
3. Run the schema.sql file to create tables:

```bash
psql -U postgres -d finance_dashboard -f schema.sql
```
