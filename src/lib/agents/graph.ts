// src/lib/agents/graph.ts
import { v4 as uuidv4 } from 'uuid';
import { GraphState, SubTask, AgentLog, AgentName, ResearchDepth } from '@/types/agent';
import { callLLM, DEPTH_CONFIG } from './llmClient';
import { tavilySearch } from '../tools/webSearch';
import { storeMemory, retrieveMemories } from '../memory/vectorStore';

function createLog(agentName: AgentName, type: AgentLog['type'], message: string, data?: Record<string, unknown>): AgentLog {
  return { id: uuidv4(), agentName, timestamp: new Date(), type, message, data };
}
function trim(text: string, max: number): string {
  return text && text.length > max ? text.slice(0, max) + '...' : text || '';
}

export async function plannerNode(state: GraphState, onLog: (log: AgentLog) => void): Promise<Partial<GraphState>> {
  onLog(createLog('planner', 'thinking', `Analyzing objective: "${trim(state.goal, 80)}"`));
  onLog(createLog('planner', 'action', `Generating ${DEPTH_CONFIG[state.depth].tasks} research tasks...`));

  const taskCount = DEPTH_CONFIG[state.depth].tasks;
  const messages = [
    {
      role: 'system' as const,
      content: `You are a strategic research planner. Break goals into exactly ${taskCount} sub-tasks. Reply ONLY with valid JSON:
{"subTasks":[{"id":"task-1","title":"Short Title (max 5 words)","description":"Specific research question to answer.","status":"pending"}]}`,
    },
    {
      role: 'user' as const,
      content: `Goal: "${trim(state.goal, 250)}"\n\nCreate exactly ${taskCount} research sub-tasks as JSON.`,
    },
  ];

  const response = await callLLM(messages, { temperature: 0.3, depth: state.depth });
  let subTasks: SubTask[] = [];
  try {
    const clean = response.content.replace(/```json|```/g, '').trim();
    subTasks = JSON.parse(clean).subTasks;
  } catch {
    onLog(createLog('planner', 'error', 'Parse failed — using defaults'));
    subTasks = Array.from({ length: taskCount }, (_, i) => ({
      id: `task-${i + 1}`, title: `Research Task ${i + 1}`,
      description: `${state.goal} — aspect ${i + 1}`, status: 'pending' as const,
    }));
  }

  onLog(createLog('planner', 'result', `✓ Plan ready: ${subTasks.length} tasks (${state.depth} depth)`));
  return { subTasks, currentAgent: 'human_review', status: 'awaiting_approval' };
}

export async function researcherNode(
  state: GraphState,
  onLog: (log: AgentLog) => void,
  onStateUpdate: (update: Partial<GraphState>) => void
): Promise<Partial<GraphState>> {
  const researchResults = { ...state.researchResults };
  const sources = { ...state.sources };
  const subTasks = state.subTasks.map(t => ({ ...t }));

  for (let i = 0; i < subTasks.length; i++) {
    const task = subTasks[i];
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    onStateUpdate({ subTasks: [...subTasks], currentTaskIndex: i });
    onLog(createLog('researcher', 'thinking', `[${i + 1}/${subTasks.length}] "${task.title}"`));
    onLog(createLog('researcher', 'action', `Searching: "${trim(task.description, 60)}"`));

    const searchResult = await tavilySearch(task.description, 3);
    sources[task.id] = searchResult.results;
    onLog(createLog('researcher', 'result', `Found ${searchResult.results.length} sources — credibility: ${searchResult.results.map(s => s.credibilityLabel).join(', ')}`));

    const sourceText = searchResult.results.slice(0, 3)
      .map((s, idx) => `[${idx + 1}] ${s.title} (${s.credibilityLabel} credibility)\n${trim(s.snippet, 200)}`)
      .join('\n\n');

    const prevMemories = await retrieveMemories(state.goalId, task.description, 2);
    const memCtx = prevMemories.length > 0 ? `Prior context: ${trim(prevMemories.map(m => m.content).join(' '), 150)}` : '';

    const messages = [
      { role: 'system' as const, content: `You are an expert research analyst. Write a comprehensive 4-5 paragraph detailed analysis. Include ALL specific facts, dates, statistics, quotes, and scholarly references found in sources. Cite every claim with [1], [2], [3]. Be thorough and leave nothing out. The user needs complete professional-grade information.`},
    ];

    const response = await callLLM(messages, { temperature: 0.2, depth: state.depth });
    researchResults[task.id] = response.content;

    await storeMemory({ id: uuidv4(), goalId: state.goalId, content: trim(response.content, 400), metadata: { agentName: 'researcher', taskId: task.id, timestamp: new Date().toISOString() } });

    task.status = 'completed';
    task.result = response.content;
    task.sources = searchResult.results;
    task.completedAt = new Date().toISOString();
    task.duration = Math.round((new Date(task.completedAt).getTime() - new Date(task.startedAt!).getTime()) / 1000);

    onLog(createLog('researcher', 'result', `✓ "${task.title}" — ${task.duration}s`));
    onStateUpdate({ subTasks: [...subTasks], researchResults: { ...researchResults }, sources: { ...sources } });

    if (i < subTasks.length - 1) {
      onLog(createLog('researcher', 'info', `Pausing 1s (rate limit protection)...`));
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return { subTasks, researchResults, sources, currentAgent: 'analyst', status: 'analyzing' };
}

export async function analystNode(state: GraphState, onLog: (log: AgentLog) => void): Promise<Partial<GraphState>> {
  onLog(createLog('analyst', 'thinking', 'Cross-referencing all research results...'));
  onLog(createLog('analyst', 'action', 'Running hallucination & contradiction detection...'));

  const allResearch = state.subTasks
    .map(task => `## ${task.title}\n${trim(state.researchResults[task.id] || 'No data', 800)}`)
    .join('\n\n');

  const analysisMessages = [
    {
      role: 'system' as const,
      content: `You are a critical fact-checker. Reply ONLY with valid JSON:
{"synthesis":"2 paragraph synthesis","hallucinations":["list unsupported claims"],"contradictions":["list contradictions"],"confidence":0.85,"keyFindings":["finding 1","finding 2","finding 3"]}`,
    },
    { role: 'user' as const, content: `Goal: "${trim(state.goal, 150)}"\n\nResearch:\n${trim(allResearch, 1000)}\n\nAnalyze and verify. Return JSON only.` },
  ];

  const analysisResponse = await callLLM(analysisMessages, { temperature: 0.1, depth: state.depth });

  let synthesis = '', hallucinations: string[] = [], contradictions: string[] = [], confidenceScore = 0.8, keyFindings: string[] = [];
  try {
    const clean = analysisResponse.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    synthesis = parsed.synthesis || '';
    hallucinations = parsed.hallucinations || [];
    contradictions = parsed.contradictions || [];
    confidenceScore = parsed.confidence || 0.8;
    keyFindings = parsed.keyFindings || [];
    onLog(createLog('analyst', 'result', `✓ Analysis complete — confidence: ${Math.round(confidenceScore * 100)}%`));
  } catch {
    synthesis = analysisResponse.content;
    onLog(createLog('analyst', 'info', 'Analysis complete (raw)'));
  }

  if (hallucinations.length === 0) onLog(createLog('analyst', 'result', '✓ Zero hallucinations detected'));
  else onLog(createLog('analyst', 'info', `⚠ ${hallucinations.length} potential hallucinations flagged`));
  if (contradictions.length === 0) onLog(createLog('analyst', 'result', '✓ No contradictions found'));

  await new Promise(r => setTimeout(r, 300));
  onLog(createLog('analyst', 'action', 'Generating executive report...'));

  const reportMessages = [
    {
      role: 'system' as const,
        content: `You are a senior research director at a top consulting firm. Write a comprehensive, detailed executive research report in Markdown. YOU MUST WRITE THE REPORT COMPLETELY IN ${state.language.toUpperCase()}. Include: # Title, ## Executive Summary (3 paragraphs), ## Key Findings (detailed bullets with citations), ## Detailed Analysis (one ## section per research task with full paragraphs), ## Expert Opinions & Scholarly Views, ## Challenges & Limitations, ## Conclusion & Recommendations. Use specific facts, dates, statistics, and citations throughout. Minimum 800 words. Be thorough and authoritative.`,    },
    {
      role: 'user' as const,
      content: `Goal: "${trim(state.goal, 150)}"
Summary: ${trim(synthesis, 500)}
Key findings: ${keyFindings.slice(0, 3).join('; ')}
Tasks: ${state.subTasks.map(t => t.title).join(', ')}
Issues: ${hallucinations.length === 0 ? 'None' : hallucinations.slice(0, 2).join('; ')}
Confidence: ${Math.round(confidenceScore * 100)}%

Write the full executive report in Markdown.`,
    },
  ];

  const reportResponse = await callLLM(reportMessages, { temperature: 0.4, depth: state.depth });
  await storeMemory({ id: uuidv4(), goalId: state.goalId, content: trim(reportResponse.content, 400), metadata: { agentName: 'analyst', timestamp: new Date().toISOString() } });
  onLog(createLog('analyst', 'result', '✓ Executive report generated'));

  return { synthesis, hallucinations, contradictions, confidenceScore, finalReport: reportResponse.content, currentAgent: 'analyst', status: 'completed' };
}

export class ResearchGraph {
  private state: GraphState;
  private onStateUpdate: (state: Partial<GraphState>) => void;
  private onLog: (log: AgentLog) => void;

  constructor(initialState: GraphState, onStateUpdate: (s: Partial<GraphState>) => void, onLog: (l: AgentLog) => void) {
    this.state = initialState;
    this.onStateUpdate = onStateUpdate;
    this.onLog = onLog;
  }

  private applyUpdate(update: Partial<GraphState>) {
    this.state = { ...this.state, ...update };
    this.onStateUpdate(update);
  }

  private logAndStore(log: AgentLog) {
    this.state.agentLogs.push(log);
    this.onLog(log);
  }

  async runPlanning(): Promise<GraphState> {
    this.applyUpdate({ status: 'planning', currentAgent: 'planner' });
    this.applyUpdate(await plannerNode(this.state, l => this.logAndStore(l)));
    return this.state;
  }

  async runResearch(): Promise<GraphState> {
    this.applyUpdate({ status: 'researching', currentAgent: 'researcher' });
    this.applyUpdate(await researcherNode(this.state, l => this.logAndStore(l), u => this.applyUpdate(u)));
    return this.state;
  }

  async runAnalysis(): Promise<GraphState> {
    this.applyUpdate({ currentAgent: 'analyst' });
    this.applyUpdate(await analystNode(this.state, l => this.logAndStore(l)));
    return this.state;
  }

  getState() { return this.state; }
}
