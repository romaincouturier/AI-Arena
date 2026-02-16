// AI Arena — Core library barrel export
// Copy this entire `lib/` directory into your project.

// Types & constants
export type {
  DiscussionMode,
  UserMode,
  Provider,
  Stance,
  DiscussionState,
  ContextFile,
  AgentConfig,
  ApiKeys,
  SessionConfig,
  Message,
  OrchestratorDecision,
  VoteResult,
  SessionResult,
  Template,
} from "./types";

export {
  AGENT_COLORS,
  AVAILABLE_MODELS,
  MODEL_COSTS,
  estimateCost,
} from "./types";

// Expert pool
export type { ExpertProfile } from "./experts";
export { EXPERT_POOL, searchExperts } from "./experts";

// State management
export { useSessionStore, createDefaultAgent, buildSlidingContext } from "./store";

// Session history (localStorage)
export type { SavedSession } from "./history";
export { getSavedSessions, saveSession, getSession, deleteSession } from "./history";

// User memories (localStorage)
export type { Memory } from "./memories";
export { getMemories, addMemory, deleteMemory, updateMemory, buildMemoryContext } from "./memories";

// Templates
export { TEMPLATES } from "./templates";

// Custom templates (localStorage)
export type { CustomTemplate } from "./customTemplates";
export { getCustomTemplates, saveCustomTemplate, deleteCustomTemplate } from "./customTemplates";

// Export
export { exportToMarkdown, downloadMarkdown } from "./export";

// API handlers (framework-agnostic, uses standard Request/Response)
export type { OrchestrateInput, OrchestratorInput, OrchestratorOutput, SuggestExpertsInput, SuggestedExpert } from "./api-handlers";
export { handleOrchestrate, handleOrchestrator, handleSuggestExperts } from "./api-handlers";
