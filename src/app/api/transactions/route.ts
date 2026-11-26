import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  getTransactionPage,
  addTransaction,
  getAccounts,
  addAccount,
  updateTransactionCategory,
  reconcileAccount,
  updateAccountIdentifier,
  updateAccount,
  updateTransaction,
  reverseTransaction,
} from '@/lib/store';
import { apiError, BadRequestError } from '@/lib/errors';
import { todayLocal, type PersonalTransaction } from '@/lib/repo/types';
import { requireKES } from '@/lib/money';
import { queryInteger } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');

    if (type === 'accounts') {
      const accounts = await getAccounts();
      return NextResponse.json({ accounts });
    }
    if (type !== null) throw new BadRequestError('Unsupported transaction resource. Use type=accounts or omit type for ledger entries.');

    const limit = queryInteger(searchParams.get('limit'), 50, 'Limit');
    const offset = queryInteger(searchParams.get('offset'), 0, 'Offset');
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;
    const accountId = searchParams.get('accountId') || undefined;

    const page = await getTransactionPage({
      limit, offset, category, search, accountId,
      transactionType: (searchParams.get('transactionType') || undefined) as PersonalTransaction['type'] | undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      status: (searchParams.get('status') || undefined) as 'active' | 'reversed' | 'all' | undefined,
    });
    return NextResponse.json(page);
  } catch (error) {
    return apiError(error, 'GET /api/transactions');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('A JSON object is required.');

    if (body.type === 'reconcile_account') {
      const adjustment = await reconcileAccount(
        body.account_id, body.actual_balance, body.date === undefined ? todayLocal() : body.date, body.reason, body.version,
      );
      return NextResponse.json({ success: true, adjustment });
    }

    if (body.type === 'new_account') {
      const newAcc = await addAccount({
        name: body.name,
        institution: body.institution ?? '',
        account_type: body.account_type === undefined ? 'bank_savings' : body.account_type,
        currency: body.currency === undefined ? 'KES' : body.currency,
        balance: body.balance === undefined ? 0 : body.balance,
        is_asset: body.is_asset === undefined ? true : body.is_asset,
        account_identifier: body.account_identifier,
        request_id: body.request_id,
      });
      return NextResponse.json({ success: true, account: newAcc });
    }

    // New transaction
    const { account_id, amount, type, date, description, category, reference, import_source } = body;
    if (!account_id || !amount || !description) {
      return NextResponse.json({ error: 'Missing required transaction fields' }, { status: 400 });
    }

    const newTx = await addTransaction({
      account_id,
      amount,
      currency: body.currency === undefined ? 'KES' : body.currency,
      type: type === undefined ? 'expense' : type,
      date: date === undefined ? todayLocal() : date,
      description,
      category: category === undefined ? 'Other' : category,
      reference: reference === undefined || reference === '' ? `TXN${randomUUID()}` : reference,
      transfer_account_id: body.transfer_account_id,
      fee_amount: body.fee_amount === '' ? 0 : body.fee_amount,
      fee_account_id: body.fee_account_id,
      import_source: import_source === undefined ? 'manual' : import_source,
    });

    return NextResponse.json({ success: true, transaction: newTx });
  } catch (error) {
    return apiError(error, 'POST /api/transactions');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('A JSON object is required.');
    if (body.type === 'account') {
      requireKES(body.currency);
      if (['balance', 'current_balance', 'opening_balance'].some((key) => Object.hasOwn(body, key))) {
        throw new BadRequestError('Use reconciliation to correct an account balance; opening balances cannot be overwritten.');
      }
      const account = await updateAccount(body.id, body, body.version, body.reason);
      return NextResponse.json({ success: true, account });
    }
    if (body.type === 'account_identifier') {
      return NextResponse.json({ account: await updateAccountIdentifier(body.account_id, body.account_identifier, body.version) });
    }
    if (body.action === 'edit') {
      const transaction = await updateTransaction(body.id, body, body.version, body.reason);
      return NextResponse.json({ success: true, transaction });
    }
    if (body.type !== undefined || body.action !== undefined) throw new BadRequestError('Unsupported transaction edit action.');
    const transactionId = body.id;
    const category = typeof body.category === 'string' ? body.category.trim() : '';

    if (!transactionId || !category) {
      return NextResponse.json(
        { error: 'Transaction id and category are required' },
        { status: 400 },
      );
    }

    const transaction = await updateTransactionCategory(transactionId, category, body.version);
    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, transaction });
  } catch (error) {
    return apiError(error, 'PATCH /api/transactions');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (body?.confirm !== true) throw new BadRequestError('Confirm the balance reversal before continuing.');
    const transaction = await reverseTransaction(body.id, body.version, body.reason);
    return NextResponse.json({ success: true, transaction });
  } catch (error) {
    return apiError(error, 'DELETE /api/transactions');
  }
}
