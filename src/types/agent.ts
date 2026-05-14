// src/types/agent.ts

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'waiting';
export type AgentName = 'planner' | 'researcher' | 'analyst' | 'human_review';
export type ResearchDepth = 'quick' | 'standard' | 'deep';

export interface SubTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  sources?: Source[];
  startedAt?: string;
  completedAt?: string;
  duration?: number; // seconds
}

export interface Source {
  url: string;
  title: string;
  snippet: string;
  relevanceScore?: number;
  credibilityScore?: number; // 0-1
  credibilityLabel?: 'high' | 'medium' | 'low';
  domain?: string;
}

export interface AgentLog {
  id: string;
  agentName: AgentName;
  timestamp: Date;
  type: 'thinking' | 'action' | 'result' | 'error' | 'info';
  message: string;
  data?: Record<string, unknown>;
}

export interface ResearchMemory {
  id: string;
  goalId: string;
  content: string;
  metadata: {
    agentName: AgentName;
    taskId?: string;
    timestamp: string;
  };
}

export interface SavedReport {
  id: string;
  goal: string;
  finalReport: string;
  subTasks: SubTask[];
  confidenceScore: number;
  createdAt: string;
  depth: ResearchDepth;
  sources: Record<string, Source[]>;
}

export interface GraphState {
  goalId: string;
  goal: string;
  language: string;
  depth: ResearchDepth;
  subTasks: SubTask[];
  planApproved: boolean;
  currentTaskIndex: number;
  researchResults: Record<string, string>;
  sources: Record<string, Source[]>;
  synthesis: string;
  hallucinations: string[];
  contradictions: string[];
  confidenceScore: number;
  finalReport: string;
  currentAgent: AgentName;
  agentLogs: AgentLog[];
  status: 'planning' | 'awaiting_approval' | 'researching' | 'analyzing' | 'completed' | 'error';
  error?: string;
}

export interface StreamEvent {
  type: 'state_update' | 'agent_log' | 'error' | 'complete' | 'awaiting_approval' | 'phase';
  data: unknown;
}
