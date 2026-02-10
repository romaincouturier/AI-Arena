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
    config,
    setConfig,
    messages,
    setMessages,
    addMessage,
    isRunning,
    setIsRunning,
    isPaused,
    setIsPaused,
    currentSpeaker,
    setCurrentSpeaker,
    streamingContent,
    setStreamingContent,
    result,
    setResult,
    error,
    setError,
    abortController,
    setAbortController,
    reset,
  };
}

export function createDefaultAgent(index: number): AgentConfig {
  return {
    id: uuidv4(),
    name: `Agent ${index + 1}`,
    provider: "claude",
    model: "claude-sonnet-4-20250514",
    role: "",
    personality: "",
    color: AGENT_COLORS[index % AGENT_COLORS.length],
  };
}
