import { NextResponse } from 'next/server';
import { kenyanBankGateway, KenyanBankIdentifier } from '@/lib/banks';

export async function POST(request: Request) {
  try {
    const { bankCode, accountMask } = await request.json();
    if (!bankCode) {
      return NextResponse.json({ error: 'bankCode is required' }, { status: 400 });
    }

    const data = await kenyanBankGateway.syncBankData(
      bankCode as KenyanBankIdentifier,
      accountMask || '****5678'
    );
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
