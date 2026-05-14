// src/app/api/graph/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { graphStates } from '../stream/route';

export async function POST(req: NextRequest) {
  const { goalId, action, subTasks } = await req.json();
  if (!goalId) return NextResponse.json({ error: 'goalId required' }, { status: 400 });
  const state = graphStates.get(goalId);
  if (!state) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

  if (action === 'approve') {
    // Allow updated subTasks from plan editor
    const updatedState = { ...state, planApproved: true };
    if (subTasks && Array.isArray(subTasks)) updatedState.subTasks = subTasks;
    graphStates.set(goalId, updatedState);
    return NextResponse.json({ success: true });
  }
  if (action === 'reject') {
    graphStates.delete(goalId);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const goalId = req.nextUrl.searchParams.get('goalId');
  if (!goalId) return NextResponse.json({ error: 'goalId required' }, { status: 400 });
  const state = graphStates.get(goalId);
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(state);
}
