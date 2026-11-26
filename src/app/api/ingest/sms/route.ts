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
import { ingestSms } from '@/lib/repo/ingestion';
import { apiError } from '@/lib/errors';
import { accountId as validAccountId } from '@/lib/money';
import { timestampInput } from '@/lib/validation';

/** Pull "Bearer xxx" out of the Authorization header. */
function bearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
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
    let sender: string | undefined;
    let accountId: string | number | undefined;
    let counterpartAccountId: string | number | undefined;
    let receivedAt: string | undefined;
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const body = (await req.json()) as {
          message?: string; text?: string; body?: string; sender?: string; from?: string;
          accountId?: string | number; counterpartAccountId?: string | number;
          receivedAt?: string;
        };
        message = body.message ?? body.text ?? body.body ?? '';
        sender = body.sender ?? body.from;
        accountId = body.accountId;
        counterpartAccountId = body.counterpartAccountId;
        receivedAt = body.receivedAt;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    } else {
      message = await req.text();
    }

    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Empty message' }, { status: 400 });
    }

    if (sender !== undefined && typeof sender !== 'string') {
      return NextResponse.json({ error: 'Sender must be text' }, { status: 400 });
    }
    if (receivedAt !== undefined) timestampInput(receivedAt);
    if (accountId !== undefined) validAccountId(accountId);
    if (counterpartAccountId !== undefined) validAccountId(counterpartAccountId);
    if (message.length > 10000) return NextResponse.json({ error: 'Send one SMS at a time' }, { status: 400 });
    const result = await ingestSms(userId, { message, sender, accountId, counterpartAccountId, receivedAt });
    if (!result) {
      // 422, not 500: the request was well-formed, the content just was not a
      // transaction (promos, balance notices, OTPs). The forwarder should not
      // retry these, and 4xx tells it so.
      return NextResponse.json(
        { error: 'Not a recognised M-Pesa or bank transaction message', recognised: false },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, ...result }, {
      status: result.needsReview ? 202 : result.duplicate ? 200 : 201,
    });
  } catch (error) {
    return apiError(error, 'POST /api/ingest/sms');
  }
}
