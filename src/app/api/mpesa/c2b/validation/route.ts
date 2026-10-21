import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('M-Pesa C2B Validation Request:', payload);

    // Validate account reference / bill reference
    // Returning ResultCode 0 accepts the transaction
    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });
  } catch (err: any) {
    return NextResponse.json({ ResultCode: 'C2B00016', ResultDesc: 'Rejected' }, { status: 400 });
  }
}
