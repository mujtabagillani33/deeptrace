// src/lib/agents/llmClient.ts
import { ResearchDepth } from '@/types/agent';

interface Message { role: 'system' | 'user' | 'assistant'; content: string; }
interface LLMResponse { content: string; }

function trim(text: string, max: number): string {
  return text && text.length > max ? text.slice(0, max) + '...' : text || '';
}

const DEPTH_CONFIG: Record<ResearchDepth, { model: string; maxTokens: number; tasks: number }> = {
  quick:    { model: 'llama-3.1-8b-instant',      maxTokens: 1200,  tasks: 3 },
  standard: { model: 'llama-3.3-70b-versatile',   maxTokens: 1800,  tasks: 5 },
  deep:     { model: 'llama-3.3-70b-versatile',   maxTokens: 2500, tasks: 7 },
};

export async function callLLM(
  messages: Message[],
  options: { temperature?: number; maxTokens?: number; depth?: ResearchDepth } = {}
): Promise<LLMResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY missing in .env.local');

  const depth = options.depth || 'standard';
  const config = DEPTH_CONFIG[depth];

  const trimmedMessages = messages.map((m, i) => ({
    ...m,
    content: i === 0 ? trim(m.content, 1000) : trim(m.content, 3000),
  }));

  const tryFetch = async (model: string, maxTokens: number) => {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: trimmedMessages, temperature: options.temperature ?? 0.7, max_tokens: maxTokens }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw { status: res.status, message: err };
    }
    const data = await res.json();
    return { content: data.choices[0].message.content };
  };

  try {
    return await tryFetch(config.model, options.maxTokens ?? config.maxTokens);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 429 || e.status === 413) {
      console.log('Rate limit hit — waiting 30s, retrying with fast model...');
      await new Promise(r => setTimeout(r, 8000));
      return await tryFetch('llama-3.1-8b-instant', 500);
    }
    throw err;
  }
}

export { DEPTH_CONFIG };
