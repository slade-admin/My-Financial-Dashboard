import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const configuration = new Configuration({
  basePath:
    process.env.PLAID_ENV === 'sandbox'
      ? PlaidEnvironments.sandbox
      : process.env.PLAID_ENV === 'development'
      ? PlaidEnvironments.development
      : PlaidEnvironments.production,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);
