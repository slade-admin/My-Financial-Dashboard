import { NextRequest, NextResponse } from 'next/server';
import { getSavingsGoals, addSavingsGoal, updateSavingsGoal, getBudgets } from '@/lib/store';

export async function GET() {
  try {
    const [goals, budgets] = await Promise.all([getSavingsGoals(), getBudgets()]);
    return NextResponse.json({ goals, budgets });
  } catch (error: any) {
    console.error('Error fetching goals/budgets:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch goals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === 'contribute') {
      const updated = await updateSavingsGoal(body.id, Number(body.amount));
      if (!updated) {
        return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, goal: updated });
    }

    const newGoal = await addSavingsGoal({
      name: body.name,
      target_amount: Number(body.target_amount || 0),
      current_amount: Number(body.current_amount || 0),
      currency: body.currency || 'KES',
      target_date: body.target_date,
    });

    return NextResponse.json({ success: true, goal: newGoal });
  } catch (error: any) {
    console.error('Error with goals endpoint:', error);
    return NextResponse.json({ error: error.message || 'Failed to process' }, { status: 500 });
  }
}
