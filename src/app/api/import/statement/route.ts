import { NextRequest, NextResponse } from 'next/server';
import { parseMpesaStatementText, addTransaction, getAccounts } from '@/lib/store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rawText, accountId, importType } = body;

    if (!rawText || !rawText.trim()) {
      return NextResponse.json({ error: 'Please provide statement or SMS text to import' }, { status: 400 });
    }

    const accounts = await getAccounts();
    const targetAccount = accounts.find((a) => String(a.id) === String(accountId)) || accounts[0];

    if (!targetAccount) {
      return NextResponse.json({ error: 'No valid account found for import' }, { status: 400 });
    }

    const parsedRows = parseMpesaStatementText(rawText);

    if (parsedRows.length === 0) {
      return NextResponse.json(
        {
          error:
            'No transactions could be parsed. Ensure the text contains M-Pesa SMS confirmation messages or valid M-Pesa CSV rows.',
        },
        { status: 422 }
      );
    }

    const imported = [];
    for (const row of parsedRows) {
      const tx = await addTransaction({
        account_id: targetAccount.id,
        amount: row.amount,
        currency: 'KES',
        type: row.type,
        date: row.date,
        description: row.description,
        category: row.category,
        reference: row.reference || `IMP${Date.now().toString().slice(-6)}`,
        import_source: importType === 'sms' ? 'mpesa_sms' : 'mpesa_statement',
      });
      imported.push(tx);
    }

    return NextResponse.json({
      success: true,
      count: imported.length,
      accountName: targetAccount.name,
      transactions: imported,
    });
  } catch (error: any) {
    console.error('Error importing statement:', error);
    return NextResponse.json({ error: error.message || 'Failed to import statement' }, { status: 500 });
  }
}
