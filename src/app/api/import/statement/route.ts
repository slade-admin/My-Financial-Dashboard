import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { apiError, BadRequestError } from '@/lib/errors';
import { queryInteger } from '@/lib/validation';
import {
  createImportPreview, commitImportBatch, getImportBatch, getImportBatches,
  getImportReversalPreview, reverseImportBatch, discardImportPreview,
} from '@/lib/repo/imports';

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    const userId = await currentUserId();
    if (id) {
      const batch = await getImportBatch(userId, id);
      const balances = request.nextUrl.searchParams.get('reversal') === 'true'
        ? await getImportReversalPreview(userId, id) : undefined;
      return NextResponse.json({ batch, balances });
    }
    return NextResponse.json(await getImportBatches(userId, queryInteger(request.nextUrl.searchParams.get('page'), 0, 'Page')));
  } catch (error) { return apiError(error, 'GET /api/import/statement'); }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await currentUserId();
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('An import request object is required.');
    if (body.action === 'commit') {
      if (body.confirm !== true) throw new BadRequestError('Explicit confirmation is required.');
      const batch = await commitImportBatch(userId, body.batchId, body.rows);
      return NextResponse.json({ batch, ...batch.summary });
    }
    if (body.action && body.action !== 'preview') throw new BadRequestError('Unsupported import action.');
    const batch = await createImportPreview(userId, {
      rawText: body.rawText, format: body.format === undefined ? 'auto' : body.format, accountId: body.accountId,
      counterpartAccountId: body.counterpartAccountId, sourceName: body.sourceName,
    });
    return NextResponse.json({ batch });
  } catch (error) { return apiError(error, 'POST /api/import/statement'); }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await currentUserId();
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('An import request object is required.');
    if (body.action === 'discard') {
      await discardImportPreview(userId, body.batchId);
      return NextResponse.json({ success: true });
    }
    if (body.action !== 'reverse' || body.confirm !== true) throw new BadRequestError('Explicit reversal confirmation is required.');
    return NextResponse.json({ batch: await reverseImportBatch(userId, body.batchId) });
  } catch (error) { return apiError(error, 'DELETE /api/import/statement'); }
}
