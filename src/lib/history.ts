import type { SessionConfig, SessionResult } from "./types";

export interface SavedSession {
  id: string;
  date: string;
  topic: string;
  mode: SessionConfig["mode"];
  agentNames: string[];
  turns: number;
  cost: number;
  config: SessionConfig;
  result: SessionResult;
}

const STORAGE_KEY = "ai-arena-history";
const MAX_SESSIONS = 30;

export function getSavedSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedSession[];
  } catch {
    return [];
  }
}

export function saveSession(config: SessionConfig, result: SessionResult): string {
  const sessions = getSavedSessions();
  const id = crypto.randomUUID?.() || Date.now().toString(36);
  const entry: SavedSession = {
    id,
    date: new Date().toISOString(),
    topic: config.topic,
    mode: config.mode,
    agentNames: config.agents.map((a) => a.name),
    turns: result.metrics.totalTurns,
    cost: result.metrics.estimatedCost,
    config,
    result,
  };
  sessions.unshift(entry);
  if (sessions.length > MAX_SESSIONS) sessions.length = MAX_SESSIONS;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  return id;
}

export function getSession(id: string): SavedSession | null {
  return getSavedSessions().find((s) => s.id === id) || null;
}

export function deleteSession(id: string): void {
  const sessions = getSavedSessions().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}
