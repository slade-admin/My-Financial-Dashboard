import { NextRequest, NextResponse } from 'next/server';
import { getAssets, addAsset, getLiabilities, addLiability } from '@/lib/store';

export async function GET() {
  try {
    const [assets, liabilities] = await Promise.all([getAssets(), getLiabilities()]);
    return NextResponse.json({ assets, liabilities });
  } catch (error: any) {
    console.error('Error fetching assets/liabilities:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { kind } = body;

    if (kind === 'asset') {
      const asset = await addAsset({
        name: body.name,
        category: body.category || 'other',
        estimated_value: Number(body.estimated_value || 0),
        currency: body.currency || 'KES',
        notes: body.notes,
      });
      return NextResponse.json({ success: true, asset });
    }

    if (kind === 'liability') {
      const liability = await addLiability({
        name: body.name,
        creditor: body.creditor || '',
        category: body.category || 'other',
        principal_amount: Number(body.principal_amount || 0),
        outstanding_balance: Number(body.outstanding_balance || 0),
        interest_rate: body.interest_rate ? Number(body.interest_rate) : undefined,
        monthly_payment: body.monthly_payment ? Number(body.monthly_payment) : undefined,
        currency: body.currency || 'KES',
        due_date: body.due_date,
        notes: body.notes,
      });
      return NextResponse.json({ success: true, liability });
    }

    return NextResponse.json({ error: 'Invalid kind. Must be asset or liability' }, { status: 400 });
  } catch (error: any) {
    console.error('Error adding asset/liability:', error);
    return NextResponse.json({ error: error.message || 'Failed to save' }, { status: 500 });
  }
}
