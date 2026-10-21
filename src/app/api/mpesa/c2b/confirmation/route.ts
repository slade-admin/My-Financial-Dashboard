import { NextResponse } from 'next/server';
import { recordMpesaCallback } from '@/lib/store';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('M-Pesa C2B Confirmation Payload:', payload);

    // Record real-time cash flow callback and automatically register as unified transaction
    const record = await recordMpesaCallback(payload, 'C2B_CONFIRMATION');

    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'C2B confirmation acknowledged and transaction logged in real-time',
      recordId: record.id,
    });
  } catch (err: any) {
    console.error('C2B Confirmation Error:', err);
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Internal error' }, { status: 500 });
  }
}
