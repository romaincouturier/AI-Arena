/**
 * AI Arena — Main entry point
 *
 * Import everything from here:
 *   import { EXPERT_POOL, handleOrchestrate, AgentCard } from "./ai-arena";
 *
 * Or import from sub-modules:
 *   import { EXPERT_POOL } from "./ai-arena/lib";
 *   import { AgentCard } from "./ai-arena/components";
 */

// Core library (types, experts, state, memory, history, templates, export, API handlers)
export * from "./lib";

// React components (AgentCard, MessageBubble, TypingIndicator)
export * from "./components";

// React hooks (useSpeechRecognition)
export * from "./hooks";
