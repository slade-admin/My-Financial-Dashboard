import { NextRequest, NextResponse } from 'next/server';
import { addBudget, getBudgets, retireBudget, updateBudget } from '@/lib/store';
import { apiError, BadRequestError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ budgets: await getBudgets(request.nextUrl.searchParams.get('month') ?? undefined) });
  } catch (error) { return apiError(error, 'GET /api/budgets'); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('A JSON object is required.');
    const budget = await addBudget({ ...body, currency: body.currency === undefined ? 'KES' : body.currency });
    return NextResponse.json({ success: true, budget });
  } catch (error) { return apiError(error, 'POST /api/budgets'); }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('A JSON object is required.');
    const budget = await updateBudget(body.id, { ...body, currency: body.currency === undefined ? 'KES' : body.currency }, body.version, body.reason);
    return NextResponse.json({ success: true, budget });
  } catch (error) { return apiError(error, 'PATCH /api/budgets'); }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (body?.confirm !== true) throw new BadRequestError('Confirm retiring this budget.');
    await retireBudget(body.id, body.version, body.reason);
    return NextResponse.json({ success: true });
  } catch (error) { return apiError(error, 'DELETE /api/budgets'); }
}
