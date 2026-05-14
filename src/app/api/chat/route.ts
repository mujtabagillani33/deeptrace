import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/agents/llmClient';

export async function POST(req: NextRequest) {
  try {
    const { report, messages } = await req.json();

    if (!report || !messages) {
      return new Response(JSON.stringify({ error: 'Report and messages are required' }), { status: 400 });
    }

    const systemPrompt = `You are a helpful AI research assistant. You are having a conversation with a user about a research report you just generated.
Here is the final research report context:
---
${report}
---
Answer the user's questions based primarily on the information in this report. If the report doesn't contain the answer, say so, but try to be helpful based on your general knowledge if appropriate. Be concise and professional.`;

    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role, content: m.content }))
    ];

    const response = await callLLM(llmMessages as any, { temperature: 0.5 });
    
    return new Response(JSON.stringify({ content: response.content }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate chat response' }), { status: 500 });
  }
}
