// src/lib/tools/webSearch.ts
import { Source } from '@/types/agent';

export interface SearchResult {
  query: string;
  results: Source[];
  rawAnswer?: string;
}

function getCredibility(url: string): { score: number; label: 'high' | 'medium' | 'low' } {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const highTrust = ['.gov', '.edu', '.org', 'reuters.com', 'bbc.com', 'apnews.com', 'nature.com', 'pubmed.ncbi', 'who.int', 'un.org', 'worldbank.org', 'imf.org', 'nytimes.com', 'washingtonpost.com', 'ft.com', 'economist.com'];
    const lowTrust = ['reddit.com', 'quora.com', 'medium.com', 'blogspot.com', 'wordpress.com', 'tumblr.com', 'buzzfeed.com'];
    if (highTrust.some(h => domain.includes(h))) return { score: 0.9, label: 'high' };
    if (lowTrust.some(l => domain.includes(l))) return { score: 0.4, label: 'low' };
    return { score: 0.7, label: 'medium' };
  } catch {
    return { score: 0.5, label: 'medium' };
  }
}

export async function tavilySearch(query: string, maxResults: number = 3): Promise<SearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return mockSearch(query, maxResults);
  try {
    const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 8000);
const response = await fetch('https://api.tavily.com/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', include_answer: true, max_results: maxResults }),
  signal: controller.signal,
});
clearTimeout(timeout);
    if (!response.ok) throw new Error(`Tavily error: ${response.statusText}`);
    const data = await response.json();
    const results: Source[] = (data.results || []).map((r: { url: string; title: string; content: string; score?: number }) => {
      const cred = getCredibility(r.url);
      return { url: r.url, title: r.title, snippet: r.content, relevanceScore: r.score, credibilityScore: cred.score, credibilityLabel: cred.label, domain: new URL(r.url).hostname.replace('www.', '') };
    });
    return { query, results, rawAnswer: data.answer };
  } catch (error) {
    console.error('Tavily error:', error);
    return mockSearch(query, maxResults);
  }
}

function mockSearch(query: string, maxResults: number): SearchResult {
  return {
    query,
    results: Array.from({ length: Math.min(maxResults, 3) }, (_, i) => ({
      url: `https://example-source-${i + 1}.com/article`,
      title: `Research Source ${i + 1}: ${query.slice(0, 40)}`,
      snippet: `Mock result for "${query}". Add TAVILY_API_KEY for real results.`,
      relevanceScore: 0.9 - i * 0.1,
      credibilityScore: 0.7,
      credibilityLabel: 'medium' as const,
      domain: `example-source-${i + 1}.com`,
    })),
    rawAnswer: `Mock answer for: ${query}`,
  };
}
