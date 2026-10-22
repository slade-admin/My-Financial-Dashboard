import { NextRequest, NextResponse } from 'next/server';
import { getTransactions, addTransaction, getAccounts, addAccount } from '@/lib/store';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');

    if (type === 'accounts') {
      const accounts = await getAccounts();
      return NextResponse.json({ accounts });
    }

    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;
    const accountId = searchParams.get('accountId') || undefined;

    const transactions = await getTransactions({ limit, category, search, accountId });
    return NextResponse.json({ transactions });
  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch transactions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.type === 'new_account') {
      const newAcc = await addAccount({
        name: body.name,
        institution: body.institution || '',
        account_type: body.account_type || 'bank_savings',
        currency: body.currency || 'KES',
        balance: Number(body.balance || 0),
        is_asset: body.is_asset ?? true,
      });
      return NextResponse.json({ success: true, account: newAcc });
    }

    // New transaction
    const { account_id, amount, type, date, description, category, reference, import_source } = body;
    if (!account_id || !amount || !description) {
      return NextResponse.json({ error: 'Missing required transaction fields' }, { status: 400 });
    }

    const newTx = await addTransaction({
      account_id,
      amount: Math.abs(Number(amount)),
      currency: body.currency || 'KES',
      type: type || 'expense',
      date: date || new Date().toISOString().split('T')[0],
      description,
      category: category || 'Other',
      reference: reference || `TXN${Date.now().toString().slice(-6)}`,
      import_source: import_source || 'manual',
    });

    return NextResponse.json({ success: true, transaction: newTx });
  } catch (error: any) {
    console.error('Error adding transaction:', error);
    return NextResponse.json({ error: error.message || 'Failed to save transaction' }, { status: 500 });
  }
}
