import { ResearchMemory } from '@/types/agent';
const store: ResearchMemory[] = [];
export async function storeMemory(m: ResearchMemory): Promise<void> { store.push(m); }
export async function retrieveMemories(goalId: string, _q: string, topK = 5): Promise<ResearchMemory[]> {
  return store.filter(m => m.goalId === goalId).slice(-topK);
}
