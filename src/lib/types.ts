export type DiscussionMode = "exploration" | "decision" | "deliverable";

export type UserMode = "observer" | "interventionist" | "director";

export type Provider = "claude" | "openai" | "gemini";

export type Stance = "pour" | "contre" | "neutre";

export type DiscussionState = "active" | "converging" | "stalling" | "ready_to_conclude";

export interface ContextFile {
  name: string;
  content: string;
}

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
  expertId?: string;
  frameworks?: string[];
  biases?: string;
  style?: string;
  contextFiles?: ContextFile[];
  constraints?: {
    maxTokensPerTurn?: number;
    mustCiteSources?: boolean;
    language?: string;
  };
}

export interface ApiKeys {
  claude?: string;
  openai?: string;
  gemini?: string;
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
  provider?: Provider;
  content: string;
  turnNumber: number;
  timestamp: number;
  tokenCount?: number;
  inputTokens?: number;
  isUser?: boolean;
  isSynthesis?: boolean;
  isVote?: boolean;
  isDeliverable?: boolean;
  isOrchestrator?: boolean;
}

export interface OrchestratorDecision {
  nextSpeaker: string;
  instruction: string;
  discussionState: DiscussionState;
  keyPointsSoFar: string[];
  turnNumber: number;
}

export interface VoteResult {
  agentId: string;
  agentName: string;
  vote: string;
  reasoning: string;
}

export interface SessionResult {
  messages: Message[];
  synthesis: string;
  keyPoints: string[];
  votes?: VoteResult[];
  deliverable?: string;
  metrics: {
    totalTurns: number;
    tokensPerAgent: Record<string, number>;
    totalTokens: number;
    totalInputTokens: number;
    estimatedCost: number;
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
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (eco)" },
    { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o Mini (eco)" },
    { id: "gpt-4o", label: "GPT-4o" },
  ],
  gemini: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (eco)" },
    { id: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro" },
  ],
};

// Cost per 1M tokens (input / output) in USD
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gemini-2.0-flash": { input: 0.10, output: 0.40 },
  "gemini-2.5-pro-preview-05-06": { input: 1.25, output: 10 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const cost = MODEL_COSTS[model];
  if (!cost) return 0;
  return (inputTokens * cost.input + outputTokens * cost.output) / 1_000_000;
}
