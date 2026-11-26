import { NextRequest, NextResponse } from 'next/server';
import { getRecordHistory } from '@/lib/store';
import { queryInteger } from '@/lib/validation';
import { apiError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    return NextResponse.json(await getRecordHistory(params.get('entity') || '', params.get('id') || '', queryInteger(params.get('page'), 0, 'Page')));
  } catch (error) { return apiError(error, 'GET /api/history'); }
}
