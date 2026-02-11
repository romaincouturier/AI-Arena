"use client";

import { useState, useCallback } from "react";
import type { SessionConfig, Message, SessionResult, AgentConfig } from "./types";
import { AGENT_COLORS } from "./types";
import { v4 as uuidv4 } from "uuid";

export function useSessionStore() {
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const reset = useCallback(() => {
    if (abortController) {
      abortController.abort();
    }
    setMessages([]);
    setIsRunning(false);
    setIsPaused(false);
    setCurrentSpeaker(null);
    setStreamingContent("");
    setResult(null);
    setError(null);
    setAbortController(null);
  }, [abortController]);

  return {
    config, setConfig,
    messages, setMessages, addMessage,
    isRunning, setIsRunning,
    isPaused, setIsPaused,
    currentSpeaker, setCurrentSpeaker,
    streamingContent, setStreamingContent,
    result, setResult,
    error, setError,
    abortController, setAbortController,
    reset,
  };
}

export function createDefaultAgent(index: number): AgentConfig {
  return {
    id: uuidv4(),
    name: `Agent ${index + 1}`,
    provider: "claude",
    model: "claude-haiku-4-5-20251001",
    role: "",
    personality: "",
    color: AGENT_COLORS[index % AGENT_COLORS.length],
  };
}

/**
 * Sliding context window: keeps the first message (topic intro),
 * a summary of skipped messages, and the last N messages.
 */
export function buildSlidingContext(
  messages: Message[],
  maxMessages: number = 20
): { agentName: string; content: string; isUser?: boolean }[] {
  if (messages.length <= maxMessages) {
    return messages.map((m) => ({
      agentName: m.agentName,
      content: m.content,
      isUser: m.isUser,
    }));
  }

  const kept = messages.slice(-maxMessages);
  const skipped = messages.slice(0, messages.length - maxMessages);

  const summaryPoints = skipped
    .filter((m) => !m.isUser)
    .map((m) => `- ${m.agentName}: ${m.content.slice(0, 120)}...`);

  const summaryMessage = {
    agentName: "Systeme",
    content: `[Resume des ${skipped.length} messages precedents]\n${summaryPoints.join("\n")}`,
    isUser: false,
  };

  return [
    summaryMessage,
    ...kept.map((m) => ({
      agentName: m.agentName,
      content: m.content,
      isUser: m.isUser,
    })),
  ];
}
