import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { query } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { access_token } = await request.json();

    // Get transactions from Plaid (last 30 days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();

    const transactionsResponse = await plaidClient.transactionsGet({
      access_token,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
    });

    const transactions = transactionsResponse.data.transactions;

    // Store transactions in database
    for (const transaction of transactions) {
      await query(
        `INSERT INTO transactions (account_id, plaid_transaction_id, amount, currency, date, merchant_name, category, payment_channel, pending)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (plaid_transaction_id) DO NOTHING`,
        [
          1, // account_id (simplified)
          transaction.transaction_id,
          transaction.amount,
          transaction.iso_currency_code || 'USD',
          transaction.date,
          transaction.merchant_name || transaction.name,
          transaction.category?.[0] || 'Other',
          transaction.payment_channel,
          transaction.pending,
        ]
      );
    }

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
