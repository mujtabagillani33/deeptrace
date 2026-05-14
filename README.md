# 🤖 Multi-Agent Autonomous Research & Execution Engine

A production-grade autonomous AI research system built with **Next.js 15**, **LangGraph.js**, and **Tailwind CSS**.  
Four specialized agents collaborate to research any topic, with a human-in-the-loop review step and vector memory.

---

## ✨ Architecture Overview

```
User Goal
   │
   ▼
┌─────────────────┐
│  Planner Agent  │  Decomposes goal → 3-5 sub-tasks
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Human Review   │  ← YOU APPROVE OR REJECT the plan
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Researcher Agent │  Runs web search (Tavily) per sub-task
│                 │  → Stores results in Pinecone
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Analyst Agent  │  Synthesizes + hallucination check
│                 │  → Generates final report
└─────────────────┘
```

---

## 📁 Project Structure

```
agent-engine/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── stream/
│   │   │   │   └── route.ts        ← SSE streaming endpoint (runs the graph)
│   │   │   └── graph/
│   │   │       └── route.ts        ← Plan approval / state retrieval
│   │   ├── layout.tsx
│   │   ├── page.tsx                ← Root page
│   │   └── globals.css
│   │
│   ├── components/
│   │   └── dashboard/
│   │       └── ResearchDashboard.tsx  ← Mission Control UI
│   │
│   ├── lib/
│   │   ├── agents/
│   │   │   ├── graph.ts            ← 🧠 LangGraph state machine
│   │   │   └── llmClient.ts        ← OpenAI API wrapper
│   │   ├── memory/
│   │   │   └── vectorStore.ts      ← Pinecone / in-memory storage
│   │   └── tools/
│   │       └── webSearch.ts        ← Tavily search wrapper
│   │
│   └── types/
│       └── agent.ts                ← All TypeScript interfaces
│
├── .env.example                    ← Copy to .env.local
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.ts
```

---

## 🚀 Setup & Installation

### Prerequisites
- **Node.js 18+** (required by Next.js 15)
- **npm** or **pnpm**

### Step 1: Get the code

```bash
# If you downloaded as a zip, extract it, then:
cd agent-engine

# Or clone from git:
git clone <your-repo-url> agent-engine
cd agent-engine
```

### Step 2: Install dependencies

```bash
npm install
# or
pnpm install
```

### Step 3: Set up environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your API keys:

| Variable | Required | Where to get it |
|---|---|---|
| `OPENAI_API_KEY` | ✅ Yes (for real AI) | [platform.openai.com](https://platform.openai.com) |
| `TAVILY_API_KEY` | Optional | [tavily.com](https://tavily.com) — 1000 free searches/month |
| `PINECONE_API_KEY` | Optional | [pinecone.io](https://pinecone.io) — free tier available |
| `PINECONE_INDEX` | Optional | Create an index with **dimension=1536**, **metric=cosine** |

> **⚡ Works without API keys!** The system runs in demo mode with mock LLM responses and simulated web search. Perfect for testing the UI and architecture.

### Step 4: Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🎮 How to Use

1. **Enter a research goal** in the left panel
   - Example: *"Analyze the current competitive landscape of AI coding assistants and their enterprise adoption in 2025"*

2. **Click "LAUNCH RESEARCH"** — the Planner Agent breaks your goal into 3-5 sub-tasks

3. **Review the plan** — a yellow banner appears asking you to approve or reject
   - Click **✓ APPROVE** to proceed to web research
   - Click **✕ REJECT** to discard and start over

4. **Watch agents work in real-time**
   - Switch between **Agent Logs** (live thinking stream), **Task Board** (task progress), and **Final Report** tabs

5. **Read your report** — the Analyst Agent synthesizes all research into an executive report

---

## 🔌 Where to Run This

| Environment | Command | Notes |
|---|---|---|
| **Local Development** | `npm run dev` | Best for testing. Runs at `localhost:3000` |
| **Production Build** | `npm run build && npm start` | Optimized build |
| **Vercel** (recommended) | Push to GitHub, connect to Vercel | Add env vars in Vercel dashboard |
| **Railway** | Connect repo, set env vars | Supports long-running connections |
| **Docker** | See Docker section below | For self-hosting |

### Deploy to Vercel (Easiest)

```bash
npm install -g vercel
vercel
```

Then add your environment variables in the Vercel dashboard under **Settings → Environment Variables**.

> ⚠️ **Important**: Vercel Hobby has a 10-second function timeout. The SSE stream runs longer than this. Use **Vercel Pro** (60s) or **Railway/Render** for production.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t research-engine .
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=sk-... \
  -e TAVILY_API_KEY=tvly-... \
  research-engine
```

---

## 🧠 Key Technical Decisions

### Why SSE instead of WebSockets?
Server-Sent Events are simpler for one-directional streaming (server → client) and work perfectly with Next.js App Router. The approval step uses a regular POST request.

### Why in-memory state for the graph?
For simplicity and demo purposes. In production, replace `graphStates` Map with **Redis** (using `ioredis`) for multi-instance support.

### Why mock LLM in development?
So the system is usable immediately without API keys. The mock responses demonstrate the full data flow and UI without cost.

### LangGraph pattern
The graph is implemented as an explicit state machine class (`ResearchGraph`) with named nodes (`plannerNode`, `researcherNode`, `analystNode`). This mirrors LangGraph's `StateGraph` pattern and can be migrated to the full LangGraph SDK with minimal changes.

---

## 🔧 Extending the System

### Add a new agent
1. Create `src/lib/agents/yourAgent.ts` exporting an async node function
2. Add it to `graph.ts` in the `ResearchGraph` class
3. Add the new phase to `GraphState.status` in `types/agent.ts`

### Switch from OpenAI to Claude
In `llmClient.ts`, replace the fetch call with the Anthropic SDK:
```typescript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```

### Add Supabase instead of Pinecone
In `vectorStore.ts`, replace Pinecone calls with Supabase `pgvector` queries:
```sql
-- Run in Supabase SQL editor:
create extension if not exists vector;
create table research_memories (
  id uuid primary key,
  goal_id text,
  content text,
  embedding vector(1536),
  metadata jsonb
);
create index on research_memories using ivfflat (embedding vector_cosine_ops);
```

---

## 📊 API Reference

### `POST /api/stream`
Starts a new research session. Returns an SSE stream.

**Body:** `{ "goal": "Your research goal" }`

**Events:**
- `state_update` — partial GraphState update
- `agent_log` — a single AgentLog entry  
- `awaiting_approval` — plan ready for human review
- `phase` — phase transition notification
- `complete` — research done, includes `finalReport`
- `error` — something went wrong

### `POST /api/graph`
Approve or reject a plan.

**Body:** `{ "goalId": "uuid", "action": "approve" | "reject" }`

### `GET /api/graph?goalId=uuid`
Retrieve current state of a research session.

---

## 📄 License

MIT — build something amazing.
