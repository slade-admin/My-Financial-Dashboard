import { NextResponse } from 'next/server';
import { recordMpesaCallback, getMpesaCallbacks } from '@/lib/store';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('Received M-Pesa STK Push Callback:', JSON.stringify(payload));

    const record = await recordMpesaCallback(payload, 'STK_PUSH_CALLBACK');

    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'Callback received and logged successfully',
      recordId: record.id,
    });
  } catch (error: any) {
    console.error('Error handling M-Pesa STK Callback:', error);
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Internal error' }, { status: 500 });
  }
}

export async function GET() {
  const callbacks = await getMpesaCallbacks();
  return NextResponse.json({ callbacks });
}
