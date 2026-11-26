import { NextRequest, NextResponse } from 'next/server';
import { getSavingsGoals, addSavingsGoal, editSavingsGoal, contributeToGoal, getGoalContributions, getBudgets } from '@/lib/store';
import { apiError, BadRequestError } from '@/lib/errors';
import { todayLocal } from '@/lib/repo/types';
import { queryInteger } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    if (params.has('id')) {
      return NextResponse.json(await getGoalContributions(params.get('id')!, queryInteger(params.get('page'), 0, 'Page')));
    }
    const [goals, budgets] = await Promise.all([getSavingsGoals(), getBudgets(params.get('month') ?? undefined)]);
    return NextResponse.json({ goals, budgets });
  } catch (error) {
    return apiError(error, 'GET /api/goals');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('A JSON object is required.');

    if (body.action === 'contribute') {
      const result = await contributeToGoal(body.id, {
        amount: body.amount, date: body.date === undefined ? todayLocal() : body.date, note: body.note,
        request_id: body.request_id, version: body.version,
      });
      return NextResponse.json({ success: true, ...result });
    }
    if (body.action !== undefined) throw new BadRequestError('Unsupported goal action.');

    const newGoal = await addSavingsGoal({
      name: body.name,
      target_amount: body.target_amount,
      current_amount: body.current_amount === undefined ? 0 : body.current_amount,
      currency: body.currency === undefined ? 'KES' : body.currency,
      target_date: body.target_date,
      request_id: body.request_id,
    });

    return NextResponse.json({ success: true, goal: newGoal });
  } catch (error) {
    return apiError(error, 'POST /api/goals');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('A JSON object is required.');
    if (Object.hasOwn(body, 'current_amount')) throw new BadRequestError('Use a contribution or release to change earmarked savings.');
    const goal = await editSavingsGoal(body.id, body, body.version, body.reason);
    return NextResponse.json({ success: true, goal });
  } catch (error) {
    return apiError(error, 'PATCH /api/goals');
  }
}
