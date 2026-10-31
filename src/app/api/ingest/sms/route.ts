/**
 * POST /api/ingest/sms
 *
 * Receives raw M-Pesa (or bank) SMS text from a phone-side forwarder and
 * records the transaction, replacing the copy-paste import loop.
 *
 * Auth is a bearer ingest token, NOT a session cookie — the caller is an
 * automation app on the phone (MacroDroid / Tasker / Automate), which has no
 * browser session:
 *
 *   POST /api/ingest/sms
 *   Authorization: Bearer <selector>.<verifier>
 *   Content-Type: application/json
 *   { "message": "<raw SMS body>", "sender": "MPESA", "receivedAt": "..." }
 *
 * Also accepts Content-Type: text/plain with the raw SMS as the whole body,
 * because some automation apps cannot build JSON easily.
 *
 * Idempotency: M-Pesa receipt numbers are unique per transaction and the
 * transactions table enforces UNIQUE (user_id, reference), so re-delivering
 * the same SMS is safe. A duplicate returns 200 with duplicate:true rather
 * than an error, so a retrying forwarder does not treat it as a failure.
 *
 * This route is in the proxy's public list (no session cookie) and therefore
 * authenticates itself — see validateIngestToken.
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateIngestToken } from '@/lib/repo/auth';
import { parseMpesaSms } from '@/lib/mpesa';
import { getAccounts, addAccount } from '@/lib/repo/accounts';
import { addTransaction } from '@/lib/repo/transactions';
import { apiError } from '@/lib/errors';
import type { PersonalAccount } from '@/lib/repo/types';

/** Pull "Bearer xxx" out of the Authorization header. */
function bearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Find the account M-Pesa transactions belong to, creating it on first use.
 *
 * Without this the forwarder would 400 until the user manually created an
 * account, which is a poor first-run experience for a background automation
 * that cannot prompt anybody.
 */
async function resolveMpesaAccount(userId: number): Promise<PersonalAccount> {
  const accounts = await getAccounts(userId);

  const existing =
    accounts.find((a) => a.account_type === 'mobile_money' && /m-?pesa/i.test(a.name)) ??
    accounts.find((a) => a.account_type === 'mobile_money');
  if (existing) return existing;

  return addAccount(userId, {
    name: 'M-PESA',
    institution: 'Safaricom',
    account_type: 'mobile_money',
    currency: 'KES',
    balance: 0,
    is_asset: true,
  });
}

export async function POST(req: NextRequest) {
  try {
    const token = bearer(req);
    if (!token) {
      return NextResponse.json(
        { error: 'Missing bearer token. Send Authorization: Bearer <ingest token>.' },
        { status: 401 },
      );
    }

    const userId = await validateIngestToken(token);
    if (userId === null) {
      return NextResponse.json({ error: 'Invalid ingest token' }, { status: 401 });
    }

    // Accept JSON {message} or a raw text/plain body.
    let message = '';
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const body = (await req.json()) as { message?: string; text?: string; body?: string };
        message = body.message ?? body.text ?? body.body ?? '';
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    } else {
      message = await req.text();
    }

    if (!message.trim()) {
      return NextResponse.json({ error: 'Empty message' }, { status: 400 });
    }

    const parsed = parseMpesaSms(message);
    if (!parsed) {
      // 422, not 500: the request was well-formed, the content just was not a
      // transaction (promos, balance notices, OTPs). The forwarder should not
      // retry these, and 4xx tells it so.
      return NextResponse.json(
        { error: 'Not a recognised M-Pesa transaction message', recognised: false },
        { status: 422 },
      );
    }

    const account = await resolveMpesaAccount(userId);

    const { transaction, isDuplicate } = await addTransaction(userId, {
      account_id: account.id,
      amount: parsed.amount,
      currency: 'KES',
      type: parsed.type,
      date: parsed.date,
      description: parsed.description,
      category: parsed.category,
      reference: parsed.reference,
      import_source: 'mpesa_sms',
    });

    return NextResponse.json(
      {
        ok: true,
        duplicate: isDuplicate,
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          type: transaction.type,
          date: transaction.date,
          description: transaction.description,
          category: transaction.category,
          reference: transaction.reference,
        },
        parsed: {
          kind: parsed.kind,
          counterparty: parsed.counterparty,
          balance: parsed.balance,
          cost: parsed.cost,
        },
        account: { id: account.id, name: account.name },
      },
      { status: isDuplicate ? 200 : 201 },
    );
  } catch (error) {
    return apiError(error, 'POST /api/ingest/sms');
  }
}
