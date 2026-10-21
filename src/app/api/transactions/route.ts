import { NextRequest, NextResponse } from 'next/server';
import { getTransactions, getAccounts } from '@/lib/store';

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
    const rail = searchParams.get('rail') || undefined;

    const transactions = await getTransactions({ limit, category, search, rail });

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
