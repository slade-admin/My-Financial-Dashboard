/**
 * GET    /api/ingest-tokens  → list tokens (no hashes returned)
 * POST   /api/ingest-tokens  → create token, returns plaintext ONCE
 * DELETE /api/ingest-tokens?id=<n>  → revoke token
 */
import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import {
  listIngestTokens,
  createIngestToken,
  deleteIngestToken,
} from '@/lib/repo/auth';
import { apiError } from '@/lib/errors';
import { objectInput, queryInteger, textInput } from '@/lib/validation';

export async function GET() {
  try {
    const uid = await currentUserId();
    const tokens = await listIngestTokens(uid);
    return NextResponse.json({ tokens });
  } catch (error) {
    return apiError(error, 'GET /api/ingest-tokens');
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await currentUserId();

    const body = objectInput(await req.json());
    const label = textInput(body.label, 'Token label', 100, true);
    const { token, row } = await createIngestToken(uid, label);

    // token is the plaintext — only returned once
    return NextResponse.json({ token, row }, { status: 201 });
  } catch (error) {
    return apiError(error, 'POST /api/ingest-tokens');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const uid = await currentUserId();
    const id = queryInteger(req.nextUrl.searchParams.get('id'), 0, 'Token id');
    if (!id) {
      return NextResponse.json({ error: 'Missing token id' }, { status: 400 });
    }
    await deleteIngestToken(uid, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'DELETE /api/ingest-tokens');
  }
}
