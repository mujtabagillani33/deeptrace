// src/app/api/stream/route.ts
import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { GraphState, AgentLog, ResearchDepth } from '@/types/agent';
import { ResearchGraph } from '@/lib/agents/graph';
export const maxDuration = 60; // Vercel Pro = 60s, Hobby = 10s

export const graphStates = new Map<string, GraphState>();

export async function POST(req: NextRequest) {
  const { goal, depth = 'standard', language = 'English' } = await req.json();
  if (!goal) return new Response(JSON.stringify({ error: 'Goal required' }), { status: 400 });

  const goalId = uuidv4();
  const initialState: GraphState = {
    goalId, goal, depth: depth as ResearchDepth, language,
    subTasks: [], planApproved: false, currentTaskIndex: 0,
    researchResults: {}, sources: {}, synthesis: '',
    hallucinations: [], contradictions: [], confidenceScore: 0,
    finalReport: '', currentAgent: 'planner', agentLogs: [], status: 'planning',
  };
  graphStates.set(goalId, initialState);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));

      try {
        const graph = new ResearchGraph(
          initialState,
          (update) => { const cur = graphStates.get(goalId)!; graphStates.set(goalId, { ...cur, ...update }); send('state_update', update); },
          (log: AgentLog) => send('agent_log', log)
        );

        send('phase', { phase: 'planning' });
        const afterPlan = await graph.runPlanning();
        graphStates.set(goalId, afterPlan);

        send('awaiting_approval', { goalId, subTasks: afterPlan.subTasks });

        const approved = await waitForApproval(goalId, 300_000);
        if (!approved) { send('error', { message: 'Plan approval timed out (5 min)' }); controller.close(); return; }

        send('phase', { phase: 'researching' });
        const afterResearch = await graph.runResearch();
        graphStates.set(goalId, afterResearch);

        send('phase', { phase: 'analyzing' });
        const afterAnalysis = await graph.runAnalysis();
        graphStates.set(goalId, afterAnalysis);

        send('complete', { finalReport: afterAnalysis.finalReport, confidenceScore: afterAnalysis.confidenceScore, sources: afterAnalysis.sources });
        controller.close();
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Unknown error' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Goal-Id': goalId },
  });
}

async function waitForApproval(goalId: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (graphStates.get(goalId)?.planApproved) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}
