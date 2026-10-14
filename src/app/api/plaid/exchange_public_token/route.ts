import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { query } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { public_token } = await request.json();

    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const access_token = exchangeResponse.data.access_token;
    const item_id = exchangeResponse.data.item_id;

    // Store access token in database (simplified - in production you'd associate with a user)
    await query(
      'INSERT INTO accounts (user_id, plaid_account_id, institution_name) VALUES ($1, $2, $3) ON CONFLICT (plaid_account_id) DO NOTHING',
      [1, item_id, 'Plaid Account']
    );

    return NextResponse.json({ access_token, item_id });
  } catch (error) {
    console.error('Error exchanging public token:', error);
    return NextResponse.json(
      { error: 'Failed to exchange public token' },
      { status: 500 }
    );
  }
}
