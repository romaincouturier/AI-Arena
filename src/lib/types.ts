export type DiscussionMode = "exploration" | "decision" | "deliverable";

export type UserMode = "observer" | "interventionist" | "director";

export type Provider = "claude" | "openai" | "gemini";

export type Stance = "pour" | "contre" | "neutre";

export type DiscussionState = "active" | "converging" | "stalling" | "ready_to_conclude";

export interface AgentConfig {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  role: string;
  personality: string;
  stance?: Stance;
  systemPrompt?: string;
  color: string;
  constraints?: {
    maxTokensPerTurn?: number;
    mustCiteSources?: boolean;
    language?: string;
  };
}

export interface SessionConfig {
  topic: string;
  additionalContext?: string;
  mode: DiscussionMode;
  userMode: UserMode;
  agents: AgentConfig[];
  rules: {
    maxTurns: number;
    maxTokensPerTurn: number;
    language: string;
  };
}

export interface Message {
  id: string;
  agentId: string;
  agentName: string;
  agentColor: string;
  content: string;
  turnNumber: number;
  timestamp: number;
  tokenCount?: number;
  isUser?: boolean;
  isSynthesis?: boolean;
}

export interface OrchestratorDecision {
  nextSpeaker: string;
  instruction: string;
  discussionState: DiscussionState;
  keyPointsSoFar: string[];
  turnNumber: number;
}

export interface SessionResult {
  messages: Message[];
  synthesis: string;
  keyPoints: string[];
  metrics: {
    totalTurns: number;
    tokensPerAgent: Record<string, number>;
    totalTokens: number;
    duration: number;
  };
}

export interface Template {
  id: string;
  name: string;
  description: string;
  mode: DiscussionMode;
  agents: Omit<AgentConfig, "id">[];
  rules: SessionConfig["rules"];
}

export const AGENT_COLORS = [
  "#3B82F6", // blue
  "#EF4444", // red
  "#10B981", // emerald
  "#F59E0B", // amber
  "#8B5CF6", // violet
  "#EC4899", // pink
];

export const AVAILABLE_MODELS: Record<Provider, { id: string; label: string }[]> = {
  claude: [
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { id: "claude-haiku-4-20250414", label: "Claude Haiku 4" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
  ],
  gemini: [
    { id: "gemini-pro", label: "Gemini Pro" },
  ],
};
