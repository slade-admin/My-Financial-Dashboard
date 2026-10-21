import { NextResponse } from 'next/server';
import { unifiedCheckout } from '@/lib/checkout';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { amount, currency, description, customerEmail, customerPhone, provider } = body;

    if (!amount || !provider) {
      return NextResponse.json({ error: 'amount and provider are required' }, { status: 400 });
    }

    const session = await unifiedCheckout.createCheckoutSession({
      amount: Number(amount),
      currency: currency || 'KES',
      description: description || 'Dashboard Unified Payment',
      customerEmail: customerEmail || 'customer@example.com',
      customerPhone,
      provider,
    });

    return NextResponse.json(session);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
