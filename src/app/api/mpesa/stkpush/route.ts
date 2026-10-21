import { NextResponse } from 'next/server';
import { mpesaService } from '@/lib/mpesa';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phoneNumber, amount, accountReference, transactionDesc } = body;

    if (!phoneNumber || !amount) {
      return NextResponse.json(
        { error: 'phoneNumber and amount are required' },
        { status: 400 }
      );
    }

    const result = await mpesaService.initiateSTKPush({
      phoneNumber: String(phoneNumber),
      amount: Number(amount),
      accountReference: accountReference || 'DashPay',
      transactionDesc: transactionDesc || 'Payment',
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('STK Push error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to trigger STK Push' },
      { status: 500 }
    );
  }
}
