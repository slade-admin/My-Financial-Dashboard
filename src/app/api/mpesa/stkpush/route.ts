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

    if (!mpesaService.isConfigured()) {
      return NextResponse.json(
        {
          error: 'M-Pesa Daraja API is not configured. Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, and MPESA_SHORTCODE in your environment.',
          configured: false,
        },
        { status: 503 }
      );
    }

    const result = await mpesaService.initiateSTKPush({
      phoneNumber: String(phoneNumber),
      amount: Number(amount),
      accountReference: accountReference || 'DashPay',
      transactionDesc: transactionDesc || 'Payment',
    });

    return NextResponse.json({
      ...result,
      status: 'pending',
      message: 'STK Push sent to customer phone. Await Safaricom callback for confirmation.',
    });
  } catch (error: any) {
    console.error('[STK Push] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'STK Push request failed', status: 'failed' },
      { status: 500 }
    );
  }
}
