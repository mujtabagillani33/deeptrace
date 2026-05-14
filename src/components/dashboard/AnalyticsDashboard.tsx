import React, { useMemo } from 'react';
import { GraphState, SavedReport, Source, SubTask } from '@/types/agent';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' '); }

// Helper: Keyword-based Sentiment Analysis
export function getSentiment(text: string): 'Positive' | 'Negative' | 'Neutral' {
  if (!text) return 'Neutral';
  const t = text.toLowerCase();
  let score = 0;
  const pos = ['good', 'great', 'excellent', 'positive', 'success', 'growth', 'profit', 'benefit', 'opportunity', 'strong', 'stable', 'improve', 'best', 'innovative', 'effective', 'efficient', 'advantage'];
  const neg = ['bad', 'terrible', 'poor', 'negative', 'fail', 'decline', 'loss', 'risk', 'threat', 'weak', 'unstable', 'worse', 'worst', 'crisis', 'conflict', 'challenge', 'problem', 'difficult'];
  pos.forEach(w => { if (t.includes(w)) score++; });
  neg.forEach(w => { if (t.includes(w)) score--; });
  if (score > 0) return 'Positive';
  if (score < 0) return 'Negative';
  return 'Neutral';
}

// Helper: Word Frequency (excluding stopwords)
function getWordFrequency(text: string, limit = 10) {
  if (!text) return [];
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  const stopWords = new Set(['the','is','are','a','an','in','on','of','to','and','for','with','as','by','this','that','it','from','be','or','at','which','not','but','we','they','their','was','were','has','have','had','will','would','can','could','what','when','where','how','why','if','then','than','there','these','those','all','any','some','many','more','most','such','no','only','very','also','into','about','other','its','our','you','your','i','my','me','he','his','him','she','her']);
  const freqs: Record<string, number> = {};
  words.forEach(w => {
    if (w.length > 2 && !stopWords.has(w)) {
      freqs[w] = (freqs[w] || 0) + 1;
    }
  });
  return Object.entries(freqs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

// Chart Tooltip customization to match dark theme
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0a0d14] border border-white/10 p-2 rounded-lg text-xs">
        <p className="font-bold text-white mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={`item-${index}`} style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function AnalyticsDashboard({ state, savedReports }: { state: GraphState, savedReports: SavedReport[] }) {
  // Compute analytics
  const hasRun = state.status === 'completed' && state.finalReport;
  
  const allSources = useMemo(() => Object.values(state.sources || {}).flat(), [state.sources]);
  
  const stats = useMemo(() => {
    if (!hasRun) return null;
    const uniqueDomains = new Set(allSources.map(s => s.domain).filter(Boolean));
    const wordCount = state.finalReport?.split(/\s+/).length || 0;
    const totalTime = state.subTasks.reduce((acc, t) => acc + (t.duration || 0), 0);
    return {
      totalSources: allSources.length,
      uniqueDomains: uniqueDomains.size,
      highCred: allSources.filter(s => s.credibilityLabel === 'high').length,
      medCred: allSources.filter(s => s.credibilityLabel === 'medium').length,
      lowCred: allSources.filter(s => s.credibilityLabel === 'low').length,
      avgRelevance: allSources.length > 0 ? (allSources.reduce((acc, s) => acc + (s.relevanceScore || 0), 0) / allSources.length).toFixed(2) : 0,
      hallucinations: state.hallucinations?.length || 0,
      contradictions: state.contradictions?.length || 0,
      wordCount,
      totalTime
    };
  }, [hasRun, allSources, state]);

  const credibilityData = useMemo(() => [
    { name: 'High', value: stats?.highCred || 0, color: '#34d399' }, // emerald-400
    { name: 'Medium', value: stats?.medCred || 0, color: '#fbbf24' }, // amber-400
    { name: 'Low', value: stats?.lowCred || 0, color: '#f87171' }, // red-400
  ].filter(d => d.value > 0), [stats]);

  const taskDurationData = useMemo(() => state.subTasks.map(t => ({
    name: t.title.length > 15 ? t.title.slice(0, 15) + '...' : t.title,
    duration: t.duration || 0,
    fill: '#8b5cf6' // violet-500
  })), [state.subTasks]);

  const wordFreqData = useMemo(() => getWordFrequency(state.finalReport, 10), [state.finalReport]);
  const tagCloudKeywords = useMemo(() => getWordFrequency(state.finalReport, 15), [state.finalReport]);

  const sentimentData = useMemo(() => {
    let pos = 0, neg = 0, neu = 0;
    allSources.forEach(s => {
      const sent = getSentiment(s.snippet);
      if (sent === 'Positive') pos++;
      else if (sent === 'Negative') neg++;
      else neu++;
    });
    return [
      { name: 'Positive', value: pos, color: '#34d399' },
      { name: 'Neutral', value: neu, color: '#9ca3af' },
      { name: 'Negative', value: neg, color: '#f87171' }
    ].filter(d => d.value > 0);
  }, [allSources]);

  const historicalConfidence = useMemo(() => {
    return savedReports.slice(0, 5).reverse().map((r, i) => ({
      name: `Report ${i+1}`,
      score: Math.round((r.confidenceScore || 0) * 100),
      fill: '#22d3ee' // cyan-400
    }));
  }, [savedReports]);

  // If no research has run, show empty state
  if (!hasRun && savedReports.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-800 text-[10px] font-black tracking-widest text-center h-full">
        <div>
          <p className="text-2xl mb-2">📊</p>
          NO DATA AVAILABLE
          <br/>
          <span className="text-[8px] font-normal text-gray-600 mt-2 block">Run a research session to generate analytics</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Metrics Grid */}
      {hasRun && stats && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold tracking-wide text-violet-400">Research Quality Metrics</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: 'TOTAL SOURCES', v: stats.totalSources, c: 'text-white' },
              { l: 'UNIQUE DOMAINS', v: stats.uniqueDomains, c: 'text-cyan-400' },
              { l: 'WORD COUNT', v: stats.wordCount, c: 'text-violet-400' },
              { l: 'TOTAL TIME', v: `${stats.totalTime}s`, c: 'text-emerald-400' },
              { l: 'AVG RELEVANCE', v: stats.avgRelevance, c: 'text-amber-400' },
              { l: 'HALLUCINATIONS', v: stats.hallucinations, c: stats.hallucinations > 0 ? 'text-red-400' : 'text-emerald-400' },
              { l: 'CONTRADICTIONS', v: stats.contradictions, c: stats.contradictions > 0 ? 'text-red-400' : 'text-emerald-400' },
              { l: 'CONFIDENCE', v: `${Math.round(state.confidenceScore * 100)}%`, c: state.confidenceScore >= 0.8 ? 'text-emerald-400' : 'text-amber-400' },
            ].map((s, i) => (
              <div key={i} className="rounded-xl glass-card p-4">
                <p className={cn('text-2xl font-bold tabular-nums', s.c)}>{s.v}</p>
                <p className="text-[10px] font-medium tracking-wide text-gray-400 mt-1">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasRun && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pie Chart: Credibility */}
          <div className="rounded-xl glass-card p-5 flex flex-col items-center">
            <span className="text-[11px] font-semibold tracking-wide text-gray-400 w-full mb-2">Source Credibility</span>
            {credibilityData.length > 0 ? (
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={credibilityData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                      {credibilityData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'var(--font-inter)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="h-[200px] flex items-center text-gray-500 text-xs">No data</div>}
          </div>

          {/* Pie Chart: Sentiment */}
          <div className="rounded-xl glass-card p-5 flex flex-col items-center">
            <span className="text-[11px] font-semibold tracking-wide text-gray-400 w-full mb-2">Sentiment Analysis (Sources)</span>
            {sentimentData.length > 0 ? (
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={0} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                      {sentimentData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'var(--font-inter)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="h-[200px] flex items-center text-gray-500 text-xs">No data</div>}
          </div>

          {/* Bar Chart: Task Duration */}
          <div className="rounded-xl glass-card p-5 col-span-1 lg:col-span-2">
            <span className="text-[11px] font-semibold tracking-wide text-gray-400 w-full mb-4 block">Task Durations (Seconds)</span>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskDurationData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                  <XAxis type="number" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} width={100} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="duration" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart: Word Frequency */}
          <div className="rounded-xl glass-card p-5 col-span-1 lg:col-span-2">
            <span className="text-[11px] font-semibold tracking-wide text-gray-400 w-full mb-4 block">Top 10 Words Frequency</span>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wordFreqData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="word" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} angle={-45} textAnchor="end" height={50} />
                  <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {hasRun && tagCloudKeywords.length > 0 && (
        <div className="rounded-xl glass-card p-5">
          <span className="text-[11px] font-semibold tracking-wide text-gray-400 w-full mb-4 block">Keyword Tag Cloud</span>
          <div className="flex flex-wrap gap-4 items-center justify-center p-6 min-h-[150px]">
            {tagCloudKeywords.map((kw, i) => {
              // Map count to font size between 12px and 32px
              const maxCount = tagCloudKeywords[0].count;
              const minCount = tagCloudKeywords[tagCloudKeywords.length - 1].count;
              const size = minCount === maxCount ? 16 : 12 + ((kw.count - minCount) / (maxCount - minCount)) * 20;
              const colors = ['text-violet-400', 'text-cyan-400', 'text-emerald-400', 'text-amber-400', 'text-white'];
              return (
                <span key={i} className={cn('transition-all hover:scale-110 cursor-default font-black', colors[i % colors.length])} style={{ fontSize: `${size}px`, opacity: 0.7 + (kw.count/maxCount)*0.3 }}>
                  {kw.word}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {hasRun && state.subTasks.some(t => t.startedAt && t.completedAt) && (
        <div className="rounded-xl glass-card p-5">
          <span className="text-[11px] font-semibold tracking-wide text-gray-400 w-full mb-4 block">Research Timeline Gantt</span>
          <div className="space-y-3 mt-4">
            {(() => {
              const tasks = state.subTasks.filter(t => t.startedAt && t.completedAt);
              if (tasks.length === 0) return <div className="text-xs text-gray-600">No timeline data</div>;
              const startTime = new Date(tasks[0].startedAt!).getTime();
              const endTime = new Date(tasks[tasks.length - 1].completedAt!).getTime();
              const totalDuration = endTime - startTime;
              
              return tasks.map((t, i) => {
                const start = new Date(t.startedAt!).getTime();
                const end = new Date(t.completedAt!).getTime();
                const leftPct = ((start - startTime) / totalDuration) * 100;
                const widthPct = Math.max(((end - start) / totalDuration) * 100, 2); // min 2% width
                
                return (
                  <div key={i} className="relative h-8 bg-white/5 rounded-lg overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 bg-violet-500/80 rounded-lg flex items-center px-2 min-w-max transition-all duration-1000" style={{ left: `${leftPct}%`, width: `${widthPct}%` }}>
                      <span className="text-[9px] text-white font-black truncate">{t.title} ({t.duration}s)</span>
                    </div>
                  </div>
                );
              });
            })()}
            <div className="flex justify-between text-[8px] text-gray-600 font-mono pt-1">
              <span>START</span>
              <span>END</span>
            </div>
          </div>
        </div>
      )}

      {/* Historical Analytics */}
      {savedReports.length > 0 && (
        <div className="rounded-xl glass-card p-5">
          <span className="text-[11px] font-semibold tracking-wide text-gray-400 w-full mb-4 block">Historical Confidence Trend (Last 5)</span>
          <div className="h-[200px] w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historicalConfidence} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Bar dataKey="score" fill="#22d3ee" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

    </div>
  );
}
