import { NextRequest, NextResponse } from 'next/server';
import { getAssets, addAsset, getLiabilities, addLiability, updateAsset, updateLiability } from '@/lib/store';
import { apiError, BadRequestError } from '@/lib/errors';

export async function GET() {
  try {
    const [assets, liabilities] = await Promise.all([getAssets(), getLiabilities()]);
    return NextResponse.json({ assets, liabilities });
  } catch (error) {
    return apiError(error, 'GET /api/assets-liabilities');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('A JSON object is required.');
    const { kind } = body;

    if (kind === 'asset') {
      const asset = await addAsset({
        name: body.name,
        category: body.category === undefined ? 'other' : body.category,
        estimated_value: body.estimated_value === undefined ? 0 : body.estimated_value,
        currency: body.currency === undefined ? 'KES' : body.currency,
        notes: body.notes,
        request_id: body.request_id,
      });
      return NextResponse.json({ success: true, asset });
    }

    if (kind === 'liability') {
      const liability = await addLiability({
        name: body.name,
        creditor: body.creditor ?? '',
        category: body.category === undefined ? 'other' : body.category,
        principal_amount: body.principal_amount === undefined ? 0 : body.principal_amount,
        outstanding_balance: body.outstanding_balance === undefined ? 0 : body.outstanding_balance,
        interest_rate: body.interest_rate === '' ? undefined : body.interest_rate,
        monthly_payment: body.monthly_payment === '' ? undefined : body.monthly_payment,
        currency: body.currency === undefined ? 'KES' : body.currency,
        due_date: body.due_date,
        notes: body.notes,
        request_id: body.request_id,
      });
      return NextResponse.json({ success: true, liability });
    }

    return NextResponse.json({ error: 'Invalid kind. Must be asset or liability' }, { status: 400 });
  } catch (error) {
    return apiError(error, 'POST /api/assets-liabilities');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('A JSON object is required.');
    if (body.kind === 'asset') {
      return NextResponse.json({ success: true, asset: await updateAsset(body.id, body, body.version, body.reason) });
    }
    if (body.kind === 'liability') {
      return NextResponse.json({ success: true, liability: await updateLiability(body.id, body, body.version, body.reason) });
    }
    throw new BadRequestError('Invalid kind. Must be asset or liability.');
  } catch (error) {
    return apiError(error, 'PATCH /api/assets-liabilities');
  }
}
