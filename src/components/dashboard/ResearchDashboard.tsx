'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AgentLog, GraphState, SubTask, SavedReport, ResearchDepth, Source } from '@/types/agent';
import AnalyticsDashboard, { getSentiment } from './AnalyticsDashboard';

type Phase = 'idle' | 'planning' | 'awaiting_approval' | 'researching' | 'analyzing' | 'completed' | 'error';
type ActiveTab = 'logs' | 'tasks' | 'report' | 'history' | 'analytics';

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' '); }
function formatTime(d: Date | string) { return new Date(d).toLocaleTimeString('en-US', { hour12: false }); }
function formatDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function trim(t: string, n: number) { return t?.length > n ? t.slice(0, n) + '...' : t || ''; }

const STORAGE_KEY = 'deeptrace_reports';
function loadReports(): SavedReport[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveReport(r: SavedReport) {
  try {
    const existing = loadReports();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([r, ...existing].slice(0, 20)));
  } catch { /* ignore */ }
}
function deleteReport(id: string) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loadReports().filter(r => r.id !== id))); } catch { /* ignore */ }
}

function CredBadge({ label }: { label?: string }) {
  if (!label) return null;
  const cfg: Record<string, string> = { high: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20', low: 'text-red-400 bg-red-500/10 border-red-500/20' };
  return <span className={cn('text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded border uppercase', cfg[label] || '')}>{label}</span>;
}

function ConfidenceMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-1000', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('text-xs font-black tabular-nums', textColor)}>{pct}%</span>
    </div>
  );
}

function LogEntry({ log, idx }: { log: AgentLog; idx: number }) {
  const agentColor: Record<string, string> = {
    planner: 'text-violet-300 border-violet-500/30 bg-violet-500/5',
    researcher: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/5',
    analyst: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5',
    human_review: 'text-amber-300 border-amber-500/30 bg-amber-500/5'
  };
  const typeIcon: Record<string, string> = { thinking: '◈', action: '▶', result: '◆', error: '✕', info: '○' };
  const typeColor: Record<string, string> = { thinking: 'text-violet-400', action: 'text-cyan-400', result: 'text-emerald-400', error: 'text-red-400', info: 'text-gray-600' };
  return (
    <div key={`logentry-${idx}`} className="flex gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors">
      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
        <span className={cn('text-xs font-bold', typeColor[log.type] || 'text-gray-400')}>{typeIcon[log.type] || '○'}</span>
        <div className="w-px flex-1 bg-white/5 min-h-[6px]" />
      </div>
      <div className="flex-1 min-w-0 pb-1.5">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn('text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded border', agentColor[log.agentName] || 'text-gray-400 border-gray-500/30')}>
            {log.agentName.replace('_', ' ').toUpperCase()}
          </span>
          <span className="text-[9px] text-gray-700 font-mono tabular-nums">{formatTime(log.timestamp)}</span>
        </div>
        <p className="text-[11px] text-gray-300 leading-relaxed">{log.message}</p>
      </div>
    </div>
  );
}

function PlanEditorCard({ task, index, onUpdate, onDelete, onDragStart, onDragOver, onDrop, isDragOver }: {
  task: SubTask; index: number;
  onUpdate: (id: string, field: 'title' | 'description', val: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (i: number) => void;
  isDragOver: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => { e.preventDefault(); onDragOver(e, index); }}
      onDrop={() => onDrop(index)}
      className={cn('rounded-xl glass-card p-3 cursor-grab active:cursor-grabbing transition-all duration-200', isDragOver ? 'border-violet-500/60 bg-violet-500/5' : '')}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center gap-1 mt-1 shrink-0">
          <span className="text-[10px] text-gray-700 font-mono">#{index + 1}</span>
          <div className="flex flex-col gap-0.5">
            <div className="w-3 h-0.5 bg-gray-700 rounded" />
            <div className="w-3 h-0.5 bg-gray-700 rounded" />
            <div className="w-3 h-0.5 bg-gray-700 rounded" />
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          <input value={task.title} onChange={e => onUpdate(task.id, 'title', e.target.value)}
            className="w-full bg-transparent text-xs font-bold text-white border-b border-white/10 focus:border-violet-500/50 focus:outline-none pb-1 transition-colors"
            placeholder="Task title..." />
          <textarea value={task.description} onChange={e => onUpdate(task.id, 'description', e.target.value)}
            rows={2} className="w-full bg-white/5 rounded-lg px-2 py-1.5 text-[11px] text-gray-400 focus:outline-none focus:bg-white/8 resize-none transition-colors"
            placeholder="What to research..." />
        </div>
        <button onClick={() => onDelete(task.id)} className="text-gray-700 hover:text-red-400 transition-colors text-sm mt-1 shrink-0">✕</button>
      </div>
    </div>
  );
}

function TaskCard({ task, index }: { task: SubTask; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = {
    pending:   { bar: 'bg-gray-700',    text: 'text-gray-600',    label: 'QUEUED', glow: '' },
    running:   { bar: 'bg-cyan-500',    text: 'text-cyan-400',    label: 'ACTIVE', glow: 'shadow-cyan-500/10 shadow-lg' },
    completed: { bar: 'bg-emerald-500', text: 'text-emerald-400', label: 'DONE',   glow: '' },
    error:     { bar: 'bg-red-500',     text: 'text-red-400',     label: 'ERROR',  glow: '' },
  }[task.status] || { bar: 'bg-gray-700', text: 'text-gray-600', label: 'QUEUED', glow: '' };

  return (
    <div className={cn('relative rounded-xl glass-card overflow-hidden transition-all duration-500', cfg.glow)}>
      <div className={cn('absolute left-0 top-0 bottom-0 w-0.5', cfg.bar)} />
      {task.status === 'running' && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/3 to-transparent animate-pulse pointer-events-none" />}
      <div className="pl-5 pr-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-gray-700 tabular-nums">#{String(index + 1).padStart(2, '0')}</span>
            <p className="text-xs font-bold text-white">{task.title}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {task.duration && <span className="text-[9px] text-gray-700 tabular-nums">{task.duration}s</span>}
            <span className={cn('text-[9px] font-black tracking-widest', cfg.text)}>{cfg.label}</span>
            {task.status === 'completed' && (
              <button onClick={() => setExpanded(!expanded)} className="text-[9px] text-gray-700 hover:text-gray-400 transition-colors">
                {expanded ? '▲' : '▼'}
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-gray-600 mt-1 ml-6">{task.description}</p>
        {task.sources && task.sources.length > 0 && (
          <div className="mt-2 ml-6 flex flex-wrap gap-1.5">
            {task.sources.slice(0, 3).map((s, si) => {
              const sentiment = getSentiment(s.snippet);
              const sentColor = sentiment === 'Positive' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : sentiment === 'Negative' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-gray-400 bg-gray-500/10 border-gray-500/20';
              const sentLabel = sentiment.slice(0, 3).toUpperCase();
              
              return (
              <a key={`src-${index}-${si}`} href={s.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[9px] px-2 py-1 rounded-full glass-panel hover:bg-white/10 transition-all shadow-sm">
                <span className={cn('w-1.5 h-1.5 rounded-full shadow-sm', s.credibilityLabel === 'high' ? 'bg-emerald-400' : s.credibilityLabel === 'low' ? 'bg-red-400' : 'bg-amber-400')} />
                <span className="font-medium text-gray-300">{s.domain || 'source'}</span>
                <CredBadge label={s.credibilityLabel} />
                <span className={cn('text-[7px] font-black tracking-widest px-1 py-0.5 rounded border uppercase ml-1', sentColor)}>{sentLabel}</span>
              </a>
              );
            })}
          </div>
        )}
        {expanded && task.result && (
          <div className="mt-3 ml-6 p-3 rounded-lg bg-white/[0.02] border border-white/5">
            <p className="text-[10px] text-gray-400 leading-relaxed">{task.result}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportRenderer({ content, confidenceScore, sources }: { content: string; confidenceScore: number; sources: Record<string, Source[]> }) {
  const [copied, setCopied] = useState(false);
  const lines = content.split('\n');
  const headers = lines.filter(l => l.startsWith('## ')).map(l => l.slice(3));
  const allSources = Object.values(sources).flat();

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMd = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'deeptrace-report.md'; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const html = `<!DOCTYPE html><html><head><title>DeepTrace Report</title>
    <style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#111;line-height:1.6}h1{font-size:24px;border-bottom:2px solid #7c3aed;padding-bottom:8px}h2{font-size:18px;color:#7c3aed;margin-top:32px}h3{font-size:14px;color:#0891b2}li{margin:4px 0}p{margin:8px 0}.conf{background:#f0fdf4;border:1px solid #86efac;padding:8px 16px;border-radius:8px;margin:16px 0;font-size:13px}</style>
    </head><body><div class="conf">Confidence: ${Math.round(confidenceScore * 100)}% | DeepTrace</div>
    ${content.replace(/^# (.+)$/gm, '<h1>$1</h1>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^- (.+)$/gm, '<li>$1</li>').replace(/\n/g, '<br>')}
    </body></html>`;
    printWin.document.write(html);
    printWin.document.close();
    printWin.print();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-gradient-to-b from-violet-500 to-cyan-500 rounded-full" />
          <div>
            <p className="text-[10px] font-black tracking-widest text-gray-600">EXECUTIVE RESEARCH REPORT</p>
            <div className="mt-1"><ConfidenceMeter score={confidenceScore} /></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyToClipboard} className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-black text-gray-500 hover:text-white transition-all">
            {copied ? '✓ COPIED' : '⎘ COPY'}
          </button>
          <button onClick={downloadMd} className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-black text-gray-500 hover:text-white transition-all">↓ MD</button>
          <button onClick={downloadPDF} className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-[10px] font-black text-white transition-all">↓ PDF</button>
        </div>
      </div>

      {headers.length > 2 && (
        <div className="mb-6 p-5 rounded-xl glass-card shadow-lg flex items-center justify-between">
          <p className="text-[9px] font-black tracking-widest text-gray-600 mb-3">TABLE OF CONTENTS</p>
          <div className="space-y-1">
            {headers.map((h, hi) => (
              <div key={`toc-${hi}`} className="flex items-center gap-2">
                <span className="text-[9px] text-gray-700 w-4">{hi + 1}.</span>
                <p className="text-[11px] text-gray-500 hover:text-violet-400 cursor-pointer transition-colors">{h}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        {lines.map((line, li) => {
          if (line.startsWith('# ')) return <h1 key={`rline-${li}`} className="text-xl font-black text-white mt-4 mb-3 pb-3 border-b border-white/8">{line.slice(2)}</h1>;
          if (line.startsWith('## ')) return <h2 key={`rline-${li}`} className="text-sm font-black text-violet-400 mt-6 mb-2 flex items-center gap-2"><span className="w-3 h-px bg-violet-500 inline-block" />{line.slice(3)}</h2>;
          if (line.startsWith('### ')) return <h3 key={`rline-${li}`} className="text-xs font-black text-cyan-400 mt-4 mb-1">{line.slice(4)}</h3>;
          if (line.startsWith('- ') || line.startsWith('* ')) return <div key={`rline-${li}`} className="flex items-start gap-2 ml-2 py-0.5"><span className="text-violet-500 mt-1 text-[10px] shrink-0">▸</span><p className="text-xs text-gray-300 leading-relaxed">{line.slice(2)}</p></div>;
          if (line.startsWith('✓')) return <p key={`rline-${li}`} className="text-xs text-emerald-400">✓{line.slice(1)}</p>;
          if (line === '') return <div key={`rline-${li}`} className="h-2" />;
          return <p key={`rline-${li}`} className="text-xs text-gray-400 leading-relaxed">{line}</p>;
        })}
      </div>

      {allSources.length > 0 && (
        <div className="mt-8 pt-6 border-t border-white/8">
          <p className="text-[10px] font-black tracking-widest text-gray-600 mb-3">SOURCES & REFERENCES</p>
          <div className="space-y-2">
            {allSources.slice(0, 10).map((s, si) => (
              <div key={`source-${si}`} className="flex items-start gap-2">
                <span className="text-[9px] text-gray-700 w-5 shrink-0">[{si + 1}]</span>
                <div className="flex-1 min-w-0">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors line-clamp-1">{s.title}</a>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-gray-700">{s.domain}</span>
                    <CredBadge label={s.credibilityLabel} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryPanel({ onLoad }: { onLoad: (r: SavedReport) => void }) {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [search, setSearch] = useState('');
  useEffect(() => { setReports(loadReports()); }, []);
  const filtered = reports.filter(r => r.goal.toLowerCase().includes(search.toLowerCase()));
  const handleDelete = (id: string) => { deleteReport(id); setReports(prev => prev.filter(r => r.id !== id)); };
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-panel shadow-sm">
        <span className="text-gray-600 text-xs">⌕</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reports..."
          className="flex-1 bg-transparent text-xs text-white placeholder:text-gray-700 focus:outline-none" />
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-700 text-xs font-black tracking-widest">NO SAVED REPORTS</p>
          <p className="text-gray-800 text-[10px] mt-1">Complete a research session to save</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r, ri) => (
            <div key={`hist-${ri}`} className="rounded-xl glass-card p-3 group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white line-clamp-2">{r.goal}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px] text-gray-700">{formatDate(r.createdAt)}</span>
                    <span className="text-[9px] text-gray-700">· {r.depth?.toUpperCase()}</span>
                    <span className="text-[9px] text-emerald-600">{Math.round((r.confidenceScore || 0) * 100)}% conf</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onLoad(r)} className="text-[9px] font-black text-violet-400 px-2 py-1 rounded border border-violet-500/20 hover:border-violet-500/40 transition-all">LOAD</button>
                  <button onClick={() => handleDelete(r.id)} className="text-[9px] text-gray-700 hover:text-red-400 px-1.5 py-1 rounded opacity-0 group-hover:opacity-100 transition-all">✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="p-4 space-y-3">
      {[0, 1, 2].map(i => (
        <div key={`skel-${i}`} className="rounded-xl border border-white/5 p-4 space-y-2">
          <div className="skeleton h-3 w-3/4 rounded" />
          <div className="skeleton h-2 w-full rounded" />
          <div className="skeleton h-2 w-2/3 rounded" />
        </div>
      ))}
    </div>
  );
}

const RESEARCH_TEMPLATES = [
  { icon: '💼', cat: 'Business', title: 'Competitor Analysis', prompt: 'Analyze the current competitive landscape of [Industry], identifying top players and their market share.' },
  { icon: '🌍', cat: 'News', title: 'Geopolitical Briefing', prompt: 'Provide a comprehensive briefing on the current geopolitical situation in [Region].' },
  { icon: '📚', cat: 'Academic', title: 'Islamic Scholarly Analysis', prompt: 'Conduct a thorough analysis of Islamic scholarly views on [Topic] across different schools of thought.' },
  { icon: '📈', cat: 'Business', title: 'Market Entry Strategy', prompt: 'Develop a strategy for launching [Product] in the Pakistan market, including risks and opportunities.' },
];

export default function ResearchDashboard() {
  const [goal, setGoal] = useState('');
  const [depth, setDepth] = useState<ResearchDepth>('standard');
  const [phase, setPhase] = useState<Phase>('idle');
  const [goalId, setGoalId] = useState<string | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [editableTasks, setEditableTasks] = useState<SubTask[]>([]);
  const [finalReport, setFinalReport] = useState('');
  const [confidenceScore, setConfidenceScore] = useState(0);
  const [sources, setSources] = useState<Record<string, Source[]>>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>('logs');
  const [error, setError] = useState('');
  const [currentAgent, setCurrentAgent] = useState('');
  const [approvalPending, setApprovalPending] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  
  const [language, setLanguage] = useState('English');
  const [chatMessages, setChatMessages] = useState<{role: string, content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setMounted(true); setSavedReports(loadReports()); }, []);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => {
    if (startTime && ['planning', 'researching', 'analyzing'].includes(phase)) {
      timerRef.current = setInterval(() => setElapsedTime(Math.floor((Date.now() - startTime) / 1000)), 1000);
    } else { if (timerRef.current) clearInterval(timerRef.current); }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, startTime]);

  const handleStream = useCallback((type: string, data: unknown) => {
    if (type === 'state_update') {
      const u = data as Partial<GraphState>;
      if (u.subTasks) setSubTasks(u.subTasks);
      if (u.currentAgent) setCurrentAgent(u.currentAgent);
      if (u.status) setPhase(u.status as Phase);
    }
    if (type === 'agent_log') setLogs(prev => [...prev, data as AgentLog]);
    if (type === 'awaiting_approval') {
      const d = data as { goalId: string; subTasks: SubTask[] };
      setGoalId(d.goalId); setSubTasks(d.subTasks);
      setEditableTasks(d.subTasks.map(t => ({ ...t })));
      setPhase('awaiting_approval'); setApprovalPending(true); setActiveTab('tasks');
    }
    if (type === 'phase') setPhase((data as { phase: string }).phase as Phase);
    if (type === 'complete') {
      const d = data as { finalReport: string; confidenceScore: number; sources: Record<string, Source[]> };
      setFinalReport(d.finalReport); setConfidenceScore(d.confidenceScore || 0.8);
      setSources(d.sources || {}); setPhase('completed'); setApprovalPending(false); setActiveTab('report');
    }
    if (type === 'error') { setError((data as { message: string }).message); setPhase('error'); setApprovalPending(false); }
  }, []);

  const startResearch = async () => {
    if (!goal.trim()) return;
    setLogs([]); setSubTasks([]); setFinalReport(''); setError(''); setSources({});
    setGoalId(null); setCurrentAgent('planner'); setPhase('planning');
    setActiveTab('logs'); setApprovalPending(false); setConfidenceScore(0);
    setStartTime(Date.now()); setElapsedTime(0);
    abortRef.current = new AbortController();
    setChatMessages([]);
    try {
      const response = await fetch('/api/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, depth, language }), signal: abortRef.current.signal,
      });
      if (!response.ok || !response.body) throw new Error('Failed to connect');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) { try { const { type, data } = JSON.parse(line.slice(6)); handleStream(type, data); } catch { /* skip */ } }
        }
      }
    } catch (err) { if ((err as Error).name !== 'AbortError') { setError((err as Error).message); setPhase('error'); } }
  };

  const approvePlan = async () => {
    if (!goalId) return;
    setApprovalPending(false); setPhase('researching'); setActiveTab('logs'); setSubTasks(editableTasks);
    await fetch('/api/graph', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goalId, action: 'approve', subTasks: editableTasks }) });
  };

  const rejectPlan = async () => {
    if (!goalId) return;
    abortRef.current?.abort();
    await fetch('/api/graph', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goalId, action: 'reject' }) });
    setPhase('idle'); setSubTasks([]); setLogs([]); setApprovalPending(false); setGoalId(null);
  };

  const addTask = () => setEditableTasks(prev => [...prev, { id: `task-custom-${Date.now()}`, title: 'New Task', description: 'Describe what to research...', status: 'pending' }]);
  const updateTask = (id: string, field: 'title' | 'description', val: string) => setEditableTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: val } : t));
  const deleteTask = (id: string) => setEditableTasks(prev => prev.filter(t => t.id !== id));
  const handleDragStart = (i: number) => setDragIdx(i);
  const handleDragOver = (_e: React.DragEvent, i: number) => setDragOverIdx(i);
  const handleDrop = (dropIdx: number) => {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const updated = [...editableTasks];
    const [moved] = updated.splice(dragIdx, 1); updated.splice(dropIdx, 0, moved);
    setEditableTasks(updated); setDragIdx(null); setDragOverIdx(null);
  };

  const handleSaveReport = useCallback(() => {
    if (!finalReport || !goalId) return;
    saveReport({ id: goalId, goal, finalReport, subTasks, confidenceScore, createdAt: new Date().toISOString(), depth, sources });
    setSavedReports(loadReports());
  }, [finalReport, goalId, goal, subTasks, confidenceScore, depth, sources]);

  useEffect(() => { if (phase === 'completed' && finalReport) handleSaveReport(); }, [phase, finalReport, handleSaveReport]);

  const loadHistoryReport = (r: SavedReport) => {
    setFinalReport(r.finalReport); setSubTasks(r.subTasks); setConfidenceScore(r.confidenceScore);
    setSources(r.sources || {}); setGoal(r.goal); setPhase('completed'); setActiveTab('report');
    setChatMessages([]);
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const newMsg = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, newMsg]);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: finalReport, messages: [...chatMessages, newMsg] })
      });
      const data = await res.json();
      if (data.content) setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (e) {
      console.error(e);
    } finally {
      setChatLoading(false);
    }
  };

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.agentName === logFilter);
  const isRunning = ['planning', 'researching', 'analyzing'].includes(phase);
  const completedTasks = subTasks.filter(t => t.status === 'completed').length;
  const progressPct = subTasks.length > 0 ? Math.round((completedTasks / subTasks.length) * 100) : 0;

  const phaseSteps = [
    { key: 'planning', label: 'PLAN' }, { key: 'awaiting_approval', label: 'REVIEW' },
    { key: 'researching', label: 'RESEARCH' }, { key: 'analyzing', label: 'ANALYZE' }, { key: 'completed', label: 'DONE' },
  ];
  const currentPhaseIdx = phaseSteps.findIndex(p => p.key === phase);

  const depthConfig: Record<ResearchDepth, { label: string; desc: string; color: string }> = {
    quick:    { label: 'QUICK',    desc: '3 tasks · ~2 min',  color: 'border-cyan-500/40 text-cyan-400' },
    standard: { label: 'STANDARD', desc: '5 tasks · ~5 min',  color: 'border-violet-500/40 text-violet-400' },
    deep:     { label: 'DEEP',     desc: '7 tasks · ~12 min', color: 'border-amber-500/40 text-amber-400' },
  };

  if (!mounted) return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-violet-600 flex items-center justify-center mx-auto">
          <span className="text-white font-black text-lg">DT</span>
        </div>
        <p className="text-[10px] font-black tracking-widest text-gray-600">DEEPTRACE LOADING...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen text-gray-200">
      <div className="fixed inset-0 pointer-events-none opacity-20" style={{ backgroundImage: `linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
      <div className="fixed top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent z-50" />

      <header className="border-b border-white/[0.05] glass-panel sticky top-0 z-40">
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative w-7 h-7 shrink-0">
              <div className="absolute inset-0 rounded-lg bg-violet-600" />
              <div className="absolute inset-0 rounded-lg flex items-center justify-center">
                <span className="text-[10px] font-black text-white tracking-wider">DT</span>
              </div>
            </div>
            <div className="hidden sm:block">
              <span className="text-xs font-black tracking-[0.15em] text-white">DEEPTRACE</span>
              <span className="text-[9px] text-gray-700 ml-2 tracking-widest hidden md:inline">AUTONOMOUS RESEARCH ENGINE</span>
            </div>
          </div>

          {phase !== 'idle' && (
            <div className="hidden lg:flex items-center gap-0 flex-1 justify-center">
              {phaseSteps.map((p, pi) => {
                const isActive = p.key === phase; const isDone = pi < currentPhaseIdx;
                return (
                  <div key={`phase-${pi}`} className="flex items-center">
                    <div className={cn('text-[9px] font-black tracking-widest px-2 py-1 rounded transition-all', isActive ? 'text-white bg-white/8' : isDone ? 'text-emerald-500' : 'text-gray-800')}>
                      {isDone ? '✓ ' : ''}{p.label}
                    </div>
                    {pi < phaseSteps.length - 1 && <div className={cn('w-5 h-px', isDone ? 'bg-emerald-500/30' : 'bg-white/5')} />}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-3 shrink-0">
            {savedReports.length > 0 && (
              <button onClick={() => setActiveTab('history')} className="text-[9px] font-black tracking-widest text-gray-700 hover:text-gray-400 transition-colors">
                ◈ {savedReports.length} SAVED
              </button>
            )}
            {isRunning && startTime && (
              <span className="text-[9px] text-gray-700 font-mono tabular-nums">
                {String(Math.floor(elapsedTime / 60)).padStart(2, '0')}:{String(elapsedTime % 60).padStart(2, '0')}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <div className={cn('w-1.5 h-1.5 rounded-full transition-all', isRunning ? 'bg-emerald-400 animate-pulse' : approvalPending ? 'bg-amber-400 animate-pulse' : phase === 'completed' ? 'bg-emerald-400' : 'bg-gray-800')} />
              <span className={cn('text-[9px] font-black tracking-widest hidden sm:block', isRunning ? 'text-emerald-500' : approvalPending ? 'text-amber-400' : 'text-gray-700')}>
                {isRunning ? 'PROCESSING' : approvalPending ? 'AWAITING YOU' : phase === 'completed' ? 'COMPLETE' : 'STANDBY'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-4 grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">

        <div className="space-y-3">
          <div className="rounded-xl glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-gray-400">Research Objective</span>
              {goal.length > 0 && <span className="text-[10px] text-gray-600 font-mono tabular-nums">{goal.length}c</span>}
            </div>
            <div className="p-3">
              <textarea value={goal} onChange={e => setGoal(e.target.value)} disabled={isRunning || approvalPending} rows={4}
                placeholder={"Enter research objective...\n\ne.g. Analyze the Iran-US conflict and Pakistan's role"}
                className="w-full bg-transparent text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none resize-none leading-relaxed" />
            </div>
            <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-3 mt-1">
              <p className="text-[10px] font-semibold tracking-wide text-gray-500">Research Depth</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.entries(depthConfig) as [ResearchDepth, typeof depthConfig.quick][]).map(([key, cfg]) => (
                  <button key={`depth-${key}`} onClick={() => setDepth(key)} disabled={isRunning || approvalPending}
                    className={cn('rounded-lg border py-2.5 text-center transition-all', depth === key ? cfg.color + ' bg-white/5' : 'border-white/5 text-gray-500 hover:text-gray-300')}>
                    <p className="text-xs font-semibold tracking-wide">{cfg.label}</p>
                    <p className="text-[9px] text-gray-500 mt-0.5">{cfg.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-3 mt-1">
              <p className="text-[10px] font-semibold tracking-wide text-gray-500">Output Language</p>
              <select value={language} onChange={e => setLanguage(e.target.value)} disabled={isRunning || approvalPending}
                className="w-full glass-panel rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/50">
                {['English', 'Urdu', 'Arabic', 'French', 'Spanish'].map(l => (
                  <option key={l} value={l} className="bg-slate-900">{l}</option>
                ))}
              </select>
            </div>
            <div className="px-3 pb-3 border-t border-white/5 pt-3 mt-1">
              <button onClick={startResearch} disabled={!goal.trim() || isRunning || approvalPending}
                className={cn('w-full py-3 rounded-lg text-xs font-bold tracking-widest transition-all shadow-lg', goal.trim() && !isRunning && !approvalPending ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-500/20' : 'bg-white/5 text-gray-600 cursor-not-allowed shadow-none')}>
                {isRunning ? <span className="flex items-center justify-center gap-2"><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />PROCESSING...</span> : 'LAUNCH ENGINE'}
              </button>
            </div>
          </div>

          {approvalPending && (
            <div className="rounded-xl border-2 border-amber-500/40 bg-amber-950/20 overflow-hidden">
              <div className="px-4 py-2 border-b border-amber-500/20 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[9px] font-black tracking-widest text-amber-400">AUTHORIZATION REQUIRED</span>
              </div>
              <div className="p-3 space-y-3">
                <p className="text-[11px] text-amber-700 leading-relaxed">Planner created <strong className="text-amber-500">{editableTasks.length} tasks</strong>. Edit, reorder, or approve.</p>
                <button onClick={() => setActiveTab('tasks')} className="w-full py-1.5 text-[9px] font-black tracking-widest text-amber-600 border border-amber-500/20 rounded-lg hover:bg-amber-500/5 transition-colors">◈ EDIT TASK PLAN →</button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={rejectPlan} className="py-2.5 rounded-lg border border-red-500/30 text-red-500 text-[9px] font-black hover:bg-red-500/5 transition-colors">✕ REJECT</button>
                  <button onClick={approvePlan} className="py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black transition-colors">✓ AUTHORIZE</button>
                </div>
              </div>
            </div>
          )}

          {phase === 'researching' && subTasks.length > 0 && (
            <div className="rounded-xl glass-card p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold tracking-wide text-gray-400">Research Progress</span>
                <span className="text-xs font-bold text-cyan-400 tabular-nums">{completedTasks}/{subTasks.length}</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 via-violet-500 to-cyan-500 rounded-full transition-all duration-1000" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="flex justify-between text-[9px] text-gray-700">
                <span>{progressPct}% complete</span>
                {elapsedTime > 0 && <span>{String(Math.floor(elapsedTime / 60)).padStart(2, '0')}:{String(elapsedTime % 60).padStart(2, '0')}</span>}
              </div>
            </div>
          )}

          {phase !== 'idle' && (
            <div className="rounded-xl glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5">
                <span className="text-xs font-semibold tracking-wide text-gray-400">Agent Matrix</span>
              </div>
              <div className="p-2 space-y-0.5">
                {[
                  { key: 'planner', label: 'PLANNER', col: 'cyan', doneP: ['awaiting_approval', 'researching', 'analyzing', 'completed'] },
                  { key: 'researcher', label: 'RESEARCHER', col: 'violet', doneP: ['analyzing', 'completed'] },
                  { key: 'analyst', label: 'ANALYST', col: 'emerald', doneP: ['completed'] },
                ].map((agent, ai) => {
                  const isActive = currentAgent === agent.key && isRunning;
                  const isDone = agent.doneP.includes(phase);
                  const colMap: Record<string, string> = { cyan: 'text-cyan-400 bg-cyan-500/5 border-cyan-500/20', violet: 'text-violet-400 bg-violet-500/5 border-violet-500/20', emerald: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/20' };
                  return (
                    <div key={`agent-${ai}`} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all', isActive ? colMap[agent.col] : 'border-transparent')}>
                      <div className={cn('w-2 h-2 rounded-full shrink-0', isActive ? (agent.col === 'cyan' ? 'bg-cyan-400 animate-pulse' : agent.col === 'violet' ? 'bg-violet-400 animate-pulse' : 'bg-emerald-400 animate-pulse') : isDone ? 'bg-emerald-400' : 'bg-gray-800')} />
                      <span className={cn('text-[10px] font-bold tracking-wider flex-1', isActive ? colMap[agent.col].split(' ')[0] : isDone ? 'text-emerald-400' : 'text-gray-500')}>{agent.label}</span>
                      <span className="text-[10px] font-semibold">{isActive ? <span className={colMap[agent.col].split(' ')[0]}>RUNNING</span> : isDone ? <span className="text-emerald-500">DONE</span> : <span className="text-gray-700">IDLE</span>}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {phase !== 'idle' && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: 'Tasks', v: subTasks.length, c: 'text-violet-400' },
                { l: 'Done', v: completedTasks, c: 'text-emerald-400' },
                { l: 'Logs', v: logs.length, c: 'text-cyan-400' },
              ].map((s, si) => (
                <div key={`stat-${si}`} className="rounded-xl glass-card p-3 text-center">
                  <p className={cn('text-xl font-bold tabular-nums', s.c)}>{s.v}</p>
                  <p className="text-[10px] font-medium text-gray-500 mt-1">{s.l}</p>
                </div>
              ))}
            </div>
          )}

          {phase === 'idle' && (
            <div className="rounded-xl glass-panel p-5 space-y-3">
              <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">Capabilities</p>
              {['Multi-agent orchestration', 'Real-time web research', 'Hallucination detection', 'Human plan editor', 'Source credibility scoring', 'PDF & Markdown export', 'Report history'].map((c, ci) => (
                <div key={`cap-${ci}`} className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-500/80 shadow-[0_0_8px_rgba(139,92,246,0.5)] shrink-0" />
                  <span className="text-[11px] text-gray-400">{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl glass-card flex flex-col shadow-2xl" style={{ minHeight: 600 }}>
          <div className="border-b border-white/5 px-2 flex items-center justify-between shrink-0 bg-white/[0.02]">
            <div className="flex overflow-x-auto">
              {[
                { key: 'logs', label: 'Logs', count: logs.length },
                { key: 'tasks', label: approvalPending ? '⚠ Plan Editor' : 'Tasks', count: subTasks.length },
                { key: 'report', label: 'Report', count: finalReport ? 1 : 0 },
                { key: 'history', label: 'History', count: savedReports.length },
                { key: 'analytics', label: 'Analytics', count: 0 },
              ].map((tab, ti) => (
                <button key={`tab-${ti}`} onClick={() => setActiveTab(tab.key as ActiveTab)}
                  className={cn('px-4 py-3 text-xs font-semibold border-b-2 -mb-px transition-all whitespace-nowrap',
                    activeTab === tab.key ? (tab.key === 'tasks' && approvalPending ? 'text-amber-400 border-amber-500' : 'text-violet-400 border-violet-500') : 'text-gray-500 border-transparent hover:text-gray-300')}>
                  {tab.label}
                  {tab.count > 0 && <span className="ml-2 text-[10px] bg-white/10 text-gray-300 px-2 py-0.5 rounded-full">{tab.count}</span>}
                </button>
              ))}
            </div>
            {isRunning && <div className="flex items-center gap-1.5 pr-1 shrink-0"><div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /><span className="text-[8px] font-black tracking-widest text-red-500">LIVE</span></div>}
          </div>

          <div className="flex-1 overflow-y-auto">
            {phase === 'idle' && activeTab !== 'history' && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-6">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl border border-violet-500/20 bg-violet-500/5 flex items-center justify-center">
                    <span className="text-3xl font-black text-violet-400">DT</span>
                  </div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full border border-emerald-500/40 bg-emerald-500/20 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  </div>
                </div>
                <div>
                  <p className="text-base font-black text-white tracking-tight">DEEPTRACE READY</p>
                  <p className="text-xs text-gray-600 max-w-sm leading-relaxed mt-2">Multi-agent autonomous research engine. Enter your objective, select depth, review the plan, then authorize.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg">
                  {[{ icon: '◈', l: 'PLANNER', d: 'Decomposes into tasks' }, { icon: '▶', l: 'RESEARCHER', d: 'Live web intelligence' }, { icon: '◆', l: 'ANALYST', d: 'Synthesis & verification' }].map((a, ai) => (
                    <div key={`feat-${ai}`} className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
                      <div className="text-violet-500 text-lg mb-1">{a.icon}</div>
                      <p className="text-[9px] font-black tracking-widest text-gray-500 mb-0.5">{a.l}</p>
                      <p className="text-[10px] text-gray-700">{a.d}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-4 py-2.5 max-w-sm">
                  <p className="text-[10px] text-amber-700">After planning, an <strong className="text-amber-500">AUTHORIZE button</strong> appears on the left</p>
                </div>
                
                <div className="w-full max-w-2xl mt-8">
                  <p className="text-[11px] font-semibold tracking-widest text-gray-400 mb-3 text-left uppercase">Research Templates</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {RESEARCH_TEMPLATES.map((t, i) => (
                      <button key={`tmpl-${i}`} onClick={() => { setGoal(t.prompt); setLanguage('English'); }}
                        className="text-left p-4 rounded-xl glass-panel hover:bg-white/[0.04] hover:border-violet-500/30 transition-all group shadow-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{t.icon}</span>
                          <span className="text-[10px] font-bold tracking-wider text-violet-400 uppercase">{t.cat}</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-200 group-hover:text-white mb-1.5">{t.title}</p>
                        <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{t.prompt}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'logs' && phase !== 'idle' && (
              <div>
                <div className="sticky top-0 bg-black/40 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center gap-3 z-10">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Filter:</span>
                  {['all', 'planner', 'researcher', 'analyst'].map((f, fi) => (
                    <button key={`filter-${fi}`} onClick={() => setLogFilter(f)}
                      className={cn('text-[8px] font-black tracking-widest px-2 py-1 rounded transition-all', logFilter === f ? 'text-white bg-white/10' : 'text-gray-700 hover:text-gray-500')}>
                      {f.toUpperCase()} {f !== 'all' && `(${logs.filter(l => l.agentName === f).length})`}
                    </button>
                  ))}
                </div>
                <div className="p-2">
                  {isRunning && filteredLogs.length === 0 ? <Skeleton /> : (
                    <>
                      {filteredLogs.map((log, li) => <LogEntry key={`logitem-${li}-${log.id}`} log={log} idx={li} />)}
                      <div ref={logsEndRef} />
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="p-4 space-y-3">
                {approvalPending ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[9px] font-black tracking-widest text-amber-400">◈ PLAN EDITOR — Drag to reorder · Click to edit</p>
                      <button onClick={addTask} className="text-[9px] font-black text-violet-400 hover:text-violet-300 border border-violet-500/20 px-2 py-1 rounded transition-all">+ ADD TASK</button>
                    </div>
                    {editableTasks.map((task, ei) => (
                      <PlanEditorCard key={`editor-${ei}-${task.id}`} task={task} index={ei}
                        onUpdate={updateTask} onDelete={deleteTask}
                        onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}
                        isDragOver={dragOverIdx === ei} />
                    ))}
                    <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-3">
                      <button onClick={rejectPlan} className="py-2.5 rounded-xl border border-red-500/30 text-red-500 text-[9px] font-black hover:bg-red-500/5 transition-colors">✕ REJECT PLAN</button>
                      <button onClick={approvePlan} className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black transition-colors">✓ AUTHORIZE RESEARCH</button>
                    </div>
                  </>
                ) : (
                  subTasks.length === 0
                    ? <div className="flex items-center justify-center py-16 text-gray-800 text-[9px] font-black tracking-widest">AWAITING TASK GENERATION...</div>
                    : subTasks.map((task, ti) => <TaskCard key={`taskcard-${ti}-${task.id}`} task={task} index={ti} />)
                )}
              </div>
            )}

            {activeTab === 'report' && (
              <div className="p-6">
                {!finalReport
                  ? <div className="flex items-center justify-center py-16 text-gray-800 text-[9px] font-black tracking-widest">REPORT WILL APPEAR AFTER ANALYSIS...</div>
                  : (
                    <div className="space-y-8">
                      <ReportRenderer content={finalReport} confidenceScore={confidenceScore} sources={sources} />
                      
                      {/* Follow-up Chat UI */}
                      <div className="pt-8 border-t border-white/10 mt-8">
                        <div className="flex items-center gap-2 mb-5">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]" />
                          <h3 className="text-base font-bold text-white tracking-wide">Follow-up Q&A</h3>
                        </div>
                        
                        <div className="space-y-4 mb-4">
                          {chatMessages.map((msg, i) => (
                            <div key={i} className={cn('p-4 rounded-xl text-sm leading-relaxed max-w-[85%] shadow-lg', msg.role === 'user' ? 'bg-gradient-to-br from-violet-600/30 to-indigo-600/20 border border-violet-500/30 ml-auto text-violet-50' : 'glass-panel text-gray-200')}>
                              {msg.content}
                            </div>
                          ))}
                          {chatLoading && (
                            <div className="p-4 rounded-xl glass-panel text-gray-400 text-sm w-32 text-center shadow-lg">
                              <span className="animate-pulse flex items-center gap-2 justify-center">Thinking<span className="flex gap-1"><span className="w-1 h-1 bg-gray-500 rounded-full animate-bounce"></span><span className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span><span className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span></span></span>
                            </div>
                          )}
                        </div>
                        
                        <form onSubmit={handleChatSubmit} className="flex gap-3 relative">
                          <input 
                            type="text" 
                            value={chatInput} 
                            onChange={e => setChatInput(e.target.value)} 
                            placeholder="Ask a question about this report..." 
                            className="flex-1 glass-panel rounded-xl px-5 py-3.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all shadow-inner"
                          />
                          <button 
                            type="submit" 
                            disabled={!chatInput.trim() || chatLoading}
                            className="px-8 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold tracking-widest disabled:opacity-50 transition-all shadow-lg shadow-violet-500/20"
                          >
                            ASK
                          </button>
                        </form>
                      </div>
                    </div>
                  )
                }
              </div>
            )}

            {activeTab === 'history' && <HistoryPanel onLoad={loadHistoryReport} />}

            {activeTab === 'analytics' && (
              <AnalyticsDashboard 
                state={{
                  goalId: goalId || '', goal, depth, language, subTasks, planApproved: !approvalPending,
                  currentTaskIndex: 0, researchResults: {}, sources, synthesis: '', hallucinations: [],
                  contradictions: [], confidenceScore, finalReport, currentAgent: currentAgent as any,
                  agentLogs: logs, status: phase as any, error
                }} 
                savedReports={savedReports} 
              />
            )}

            {phase === 'error' && error && activeTab === 'logs' && (
              <div className="p-4">
                <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-4 space-y-3">
                  <div className="flex items-center gap-2"><span className="text-red-500 font-black">✕</span><span className="text-[9px] font-black tracking-widest text-red-400">EXECUTION ERROR</span></div>
                  <p className="text-[11px] text-red-400/70 leading-relaxed font-mono">{error}</p>
                  <button onClick={() => { setPhase('idle'); setError(''); }} className="text-xs font-bold text-gray-400 hover:text-white glass-panel px-4 py-2 rounded-xl transition-all shadow-sm">← RESET SYSTEM</button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/5 px-6 py-3 flex items-center justify-between shrink-0 bg-black/20">
            <span className="text-[10px] font-semibold text-gray-500">DeepTrace v1.0</span>
            <div className="flex items-center gap-3 text-[10px] text-gray-500 font-semibold">
              <span>Groq · Llama-3.3-70b</span><span className="text-gray-700">·</span><span>Tavily</span><span className="text-gray-700">·</span><span>Next.js 15</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
