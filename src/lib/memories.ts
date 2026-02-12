export interface Memory {
  id: string;
  content: string;
  source: "auto" | "manual";
  tags: string[];
  createdAt: string;
  relatedTopic?: string;
}

const STORAGE_KEY = "ai-arena-memories";
const MAX_MEMORIES = 100;

export function getMemories(): Memory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Memory[];
  } catch {
    return [];
  }
}

export function addMemory(content: string, opts?: { source?: "auto" | "manual"; tags?: string[]; relatedTopic?: string }): Memory {
  const memories = getMemories();
  const memory: Memory = {
    id: crypto.randomUUID?.() || Date.now().toString(36),
    content,
    source: opts?.source || "manual",
    tags: opts?.tags || [],
    createdAt: new Date().toISOString(),
    relatedTopic: opts?.relatedTopic,
  };
  memories.unshift(memory);
  if (memories.length > MAX_MEMORIES) memories.length = MAX_MEMORIES;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
  return memory;
}

export function deleteMemory(id: string): void {
  const memories = getMemories().filter((m) => m.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
}

export function updateMemory(id: string, content: string): void {
  const memories = getMemories();
  const idx = memories.findIndex((m) => m.id === id);
  if (idx >= 0) {
    memories[idx].content = content;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
  }
}

/** Build a context string from relevant memories for injection into agent prompts */
export function buildMemoryContext(memories: Memory[], topic: string): string {
  if (memories.length === 0) return "";

  // Simple relevance: show most recent memories (up to 10)
  // A smarter version could do keyword matching against the topic
  const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  // Score memories by relevance
  const scored = memories.map((m) => {
    const text = (m.content + " " + (m.relatedTopic || "") + " " + m.tags.join(" ")).toLowerCase();
    const matchCount = topicWords.filter(w => text.includes(w)).length;
    return { memory: m, score: matchCount };
  });

  // Sort: highest relevance first, then most recent
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.memory.createdAt).getTime() - new Date(a.memory.createdAt).getTime();
  });

  // Take top 8 memories (mix of relevant + recent)
  const selected = scored.slice(0, 8).filter(s => s.score > 0 || scored.indexOf(s) < 3);
  if (selected.length === 0) return "";

  const lines = selected.map(s => `- ${s.memory.content}`).join("\n");
  return `\n\nMEMOIRE (informations retenues des discussions precedentes) :\n${lines}`;
}
