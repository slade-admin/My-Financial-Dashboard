import { NextResponse } from 'next/server';
import { kenyanBankGateway, KenyanBankIdentifier } from '@/lib/banks';

export async function GET() {
  const supported = kenyanBankGateway.getSupportedBanks();
  return NextResponse.json({ supportedBanks: supported });
}

export async function POST(request: Request) {
  try {
    const { bankCode, accountNumber } = await request.json();
    if (!bankCode) {
      return NextResponse.json({ error: 'bankCode is required' }, { status: 400 });
    }

    const res = await kenyanBankGateway.initiateBankConnect(
      bankCode as KenyanBankIdentifier,
      accountNumber || '****1234'
    );
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
