import { NextResponse } from 'next/server';
import { etimsService } from '@/lib/etims';
import { addEtimsInvoice, getEtimsInvoices } from '@/lib/store';

export async function GET() {
  const invoices = await getEtimsInvoices();
  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taxpayerKraPin, customerName, customerKraPin, items, transactionId } = body;

    const res = await etimsService.fiscalizeInvoice({
      taxpayerKraPin: taxpayerKraPin || 'P051234567Z',
      customerName: customerName || 'Retail Customer',
      customerKraPin,
      transactionId,
      items: items || [
        {
          itemCode: 'GENERAL-SALES',
          description: 'Standard Goods & Services',
          quantity: 1,
          unitPrice: body.amount || 5000,
          taxType: '16_VAT',
        },
      ],
    });

    // Store in eTIMS persistence log
    await addEtimsInvoice(res, transactionId);

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
