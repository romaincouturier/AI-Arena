"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SessionConfig, Message } from "@/lib/types";
import MessageBubble from "@/components/MessageBubble";
import TypingIndicator from "@/components/TypingIndicator";
import { v4 as uuidv4 } from "uuid";

export default function DiscussionPage() {
  const router = useRouter();
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [userInput, setUserInput] = useState("");
  const [turnNumber, setTurnNumber] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [discussionState, setDiscussionState] = useState<string>("active");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pauseRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const userMessagesRef = useRef<Message[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    pauseRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Load config from sessionStorage
  useEffect(() => {
    const configStr = sessionStorage.getItem("ai-arena-config");
    if (!configStr) {
      router.push("/");
      return;
    }
    try {
      setConfig(JSON.parse(configStr));
    } catch {
      router.push("/");
    }
  }, [router]);

  const callAgent = useCallback(
    async (
      agentConfig: SessionConfig["agents"][0],
      instruction: string,
      history: Message[],
      turn: number
    ): Promise<{ content: string; tokens: number }> => {
      const apiKey = sessionStorage.getItem("ai-arena-api-key") || "";

      const systemPrompt = agentConfig.systemPrompt || buildSystemPrompt(agentConfig, config!);
      const turnInstruction = instruction;

      const response = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          model: agentConfig.model,
          systemPrompt,
          turnInstruction,
          history: history.map((m) => ({
            agentName: m.agentName,
            content: m.content,
            isUser: m.isUser,
          })),
          topic: config!.topic,
          maxTokens: config!.rules.maxTokensPerTurn,
        }),
        signal: abortRef.current?.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let fullContent = "";
      let tokenCount = 0;

      setCurrentSpeaker(agentConfig.id);
      setStreamingContent("");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content") {
                fullContent += parsed.text;
                setStreamingContent(fullContent);
              } else if (parsed.type === "usage") {
                tokenCount = parsed.outputTokens || 0;
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }

      setCurrentSpeaker(null);
      setStreamingContent("");

      return { content: fullContent, tokens: tokenCount };
    },
    [config]
  );

  const runDiscussion = useCallback(async () => {
    if (!config) return;

    setIsRunning(true);
    setError(null);
    abortRef.current = new AbortController();

    const allMessages: Message[] = [];
    let currentTurn = 0;
    let tokensUsed = 0;
    let currentKeyPoints: string[] = [];

    try {
      for (let turn = 0; turn < config.rules.maxTurns; turn++) {
        currentTurn = turn + 1;
        setTurnNumber(currentTurn);

        for (const agent of config.agents) {
          // Check for pause
          while (pauseRef.current) {
            await new Promise((r) => setTimeout(r, 500));
          }

          // Check abort
          if (abortRef.current?.signal.aborted) {
            throw new Error("Discussion arretee");
          }

          // If director mode, we already have all messages queued
          // Build instruction
          const instruction = buildTurnInstruction(agent, config, currentTurn, allMessages);

          // Include any user messages that were added
          const pendingUserMessages = userMessagesRef.current;
          if (pendingUserMessages.length > 0) {
            allMessages.push(...pendingUserMessages);
            setMessages([...allMessages]);
            userMessagesRef.current = [];
          }

          const { content, tokens } = await callAgent(
            agent,
            instruction,
            allMessages,
            currentTurn
          );

          tokensUsed += tokens;
          setTotalTokens(tokensUsed);

          const message: Message = {
            id: uuidv4(),
            agentId: agent.id,
            agentName: agent.name,
            agentColor: agent.color,
            content,
            turnNumber: currentTurn,
            timestamp: Date.now(),
            tokenCount: tokens,
          };

          allMessages.push(message);
          setMessages([...allMessages]);
        }
      }

      // Generate synthesis
      setCurrentSpeaker("synthesis");
      const synthesisAgent = config.agents[0];
      const apiKey = sessionStorage.getItem("ai-arena-api-key") || "";

      const synthResponse = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          model: synthesisAgent.model,
          systemPrompt: `Tu es un expert en synthese de discussions. Produis une synthese structuree et actionnable de la discussion suivante. Identifie les points cles, les zones de consensus, les desaccords, et les conclusions principales. Reponds en ${config.rules.language === "fr" ? "francais" : "anglais"}.`,
          turnInstruction: "Produis la synthese finale de cette discussion.",
          history: allMessages.map((m) => ({
            agentName: m.agentName,
            content: m.content,
            isUser: m.isUser,
          })),
          topic: config.topic,
          maxTokens: 1000,
        }),
      });

      if (synthResponse.ok) {
        const reader = synthResponse.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let synthContent = "";
          setStreamingContent("");

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === "content") {
                    synthContent += parsed.text;
                    setStreamingContent(synthContent);
                  }
                } catch {
                  // skip
                }
              }
            }
          }

          const synthMessage: Message = {
            id: uuidv4(),
            agentId: "synthesis",
            agentName: "Synthese",
            agentColor: "#3B82F6",
            content: synthContent,
            turnNumber: currentTurn + 1,
            timestamp: Date.now(),
            isSynthesis: true,
          };

          allMessages.push(synthMessage);
          setMessages([...allMessages]);

          // Store results
          const result = {
            messages: allMessages,
            synthesis: synthContent,
            keyPoints: currentKeyPoints,
            metrics: {
              totalTurns: currentTurn,
              tokensPerAgent: computeTokensPerAgent(allMessages),
              totalTokens: tokensUsed,
              duration: 0,
            },
          };
          sessionStorage.setItem("ai-arena-result", JSON.stringify(result));
          sessionStorage.setItem("ai-arena-start-time", String(Date.now()));
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled, that's ok
      } else {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      }
    } finally {
      setIsRunning(false);
      setCurrentSpeaker(null);
      setStreamingContent("");
    }
  }, [config, callAgent]);

  // Auto-start discussion
  useEffect(() => {
    if (config && !isRunning && messages.length === 0 && !error) {
      const startTime = Date.now();
      sessionStorage.setItem("ai-arena-start-time", String(startTime));
      runDiscussion();
    }
  }, [config, isRunning, messages.length, error, runDiscussion]);

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setIsRunning(false);
  };

  const handleUserIntervention = () => {
    if (!userInput.trim() || !config) return;
    const userMessage: Message = {
      id: uuidv4(),
      agentId: "user",
      agentName: "Utilisateur",
      agentColor: "#6B7280",
      content: userInput.trim(),
      turnNumber: turnNumber,
      timestamp: Date.now(),
      isUser: true,
    };
    userMessagesRef.current.push(userMessage);
    setMessages((prev) => [...prev, userMessage]);
    setUserInput("");
  };

  const goToResults = () => {
    const startTime = Number(sessionStorage.getItem("ai-arena-start-time") || Date.now());
    const result = {
      messages,
      synthesis: messages.find((m) => m.isSynthesis)?.content || "",
      keyPoints,
      metrics: {
        totalTurns: turnNumber,
        tokensPerAgent: computeTokensPerAgent(messages),
        totalTokens,
        duration: Date.now() - startTime,
      },
    };
    sessionStorage.setItem("ai-arena-result", JSON.stringify(result));
    router.push("/results");
  };

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted">Chargement...</div>
      </div>
    );
  }

  const currentAgent = config.agents.find((a) => a.id === currentSpeaker);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg p-1.5 text-muted transition-colors hover:text-foreground"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-sm font-semibold">AI Arena</h1>
              <p className="max-w-md truncate text-xs text-muted">{config.topic}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>Tour {turnNumber}/{config.rules.maxTurns}</span>
              <span className="text-border">|</span>
              <span>{totalTokens} tokens</span>
              <span className="text-border">|</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  discussionState === "active"
                    ? "bg-success/10 text-success"
                    : discussionState === "stalling"
                      ? "bg-danger/10 text-danger"
                      : "bg-accent/10 text-accent"
                }`}
              >
                {isRunning ? (isPaused ? "En pause" : "En cours") : "Termine"}
              </span>
            </div>
            {isRunning && (
              <div className="flex gap-2">
                <button
                  onClick={handlePause}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:border-border-hover"
                >
                  {isPaused ? "Reprendre" : "Pause"}
                </button>
                <button
                  onClick={handleStop}
                  className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs text-danger transition-colors hover:bg-danger/10"
                >
                  Arreter
                </button>
              </div>
            )}
            {!isRunning && messages.length > 0 && (
              <button
                onClick={goToResults}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Voir les resultats
              </button>
            )}
          </div>
        </div>
        {/* Agent badges */}
        <div className="flex gap-2 overflow-x-auto px-6 pb-3">
          {config.agents.map((agent) => (
            <div
              key={agent.id}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs transition-all ${
                currentSpeaker === agent.id
                  ? "border-transparent"
                  : "border-border"
              }`}
              style={
                currentSpeaker === agent.id
                  ? { borderColor: agent.color, backgroundColor: agent.color + "15" }
                  : {}
              }
            >
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: agent.color }}
              />
              <span style={currentSpeaker === agent.id ? { color: agent.color } : {}}>
                {agent.name}
              </span>
              {agent.role && (
                <span className="text-muted">({agent.role})</span>
              )}
            </div>
          ))}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Streaming content */}
        {currentSpeaker && currentSpeaker !== "synthesis" && currentAgent && streamingContent && (
          <div className="animate-fade-in-up mx-4 my-3">
            <div className="flex items-start gap-3">
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: currentAgent.color }}
              >
                {currentAgent.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: currentAgent.color }}>
                    {currentAgent.name}
                  </span>
                  <span className="text-xs text-muted">Tour {turnNumber}</span>
                </div>
                <div
                  className="rounded-xl rounded-tl-sm border px-4 py-3"
                  style={{ borderColor: currentAgent.color + "40" }}
                >
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {streamingContent}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Synthesis streaming */}
        {currentSpeaker === "synthesis" && streamingContent && (
          <div className="animate-fade-in-up mx-4 my-4 rounded-xl border border-accent/30 bg-accent/5 p-5">
            <div className="mb-2 flex items-center gap-2">
              <svg className="h-5 w-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-semibold text-accent">Synthese en cours...</span>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {streamingContent}
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {currentSpeaker && !streamingContent && currentAgent && (
          <TypingIndicator agentName={currentAgent.name} agentColor={currentAgent.color} />
        )}

        {/* Error */}
        {error && (
          <div className="mx-4 my-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* User input (interventionist mode) */}
      {config.userMode !== "observer" && (
        <div className="shrink-0 border-t border-border px-6 py-3">
          <div className="flex gap-3">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUserIntervention()}
              className="flex-1 rounded-lg border border-border bg-card px-4 py-2 text-sm outline-none focus:border-accent"
              placeholder="Intervenir dans la discussion..."
            />
            <button
              onClick={handleUserIntervention}
              disabled={!userInput.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              Envoyer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function buildSystemPrompt(
  agent: SessionConfig["agents"][0],
  config: SessionConfig
): string {
  return `Tu participes a une discussion de groupe sur le sujet suivant :
${config.topic}

${config.additionalContext ? `Contexte additionnel : ${config.additionalContext}` : ""}

Ton role : ${agent.role || "Participant"}
Ta personnalite : ${agent.personality || "Neutre et constructif"}
${agent.stance ? `Ta position initiale : ${agent.stance}` : ""}

Regles de la discussion :
- Reponds de maniere concise et percutante (max ${config.rules.maxTokensPerTurn} tokens)
- Adresse-toi directement aux autres participants par leur nom
- Fais avancer la discussion : ne repete pas ce qui a ete dit
- Si tu es d'accord avec un point, dis-le brievement et ajoute de la valeur
- Si tu n'es pas d'accord, argumente avec des faits ou un raisonnement
- Langue : ${config.rules.language === "fr" ? "francais" : "anglais"}`;
}

function buildTurnInstruction(
  agent: SessionConfig["agents"][0],
  config: SessionConfig,
  turn: number,
  history: Message[]
): string {
  if (history.length === 0) {
    return `C'est le debut de la discussion. Presente ta perspective sur le sujet "${config.topic}" en tant que ${agent.role || agent.name}. Sois direct et engageant.`;
  }

  const lastMessage = history[history.length - 1];
  const otherSpeakers = history
    .filter((m) => m.agentId !== agent.id && !m.isUser && !m.isSynthesis)
    .map((m) => m.agentName);
  const uniqueSpeakers = [...new Set(otherSpeakers)];

  if (turn > config.rules.maxTurns * 0.8) {
    return `La discussion approche de sa fin. Synthetise ta position et fais une contribution finale significative en repondant aux points souleves${lastMessage ? ` par ${lastMessage.agentName}` : ""}.`;
  }

  return `C'est ton tour. Reponds aux points souleves${lastMessage ? ` par ${lastMessage.agentName}` : ""}${uniqueSpeakers.length > 1 ? ` et les autres participants (${uniqueSpeakers.join(", ")})` : ""}. Fais avancer la discussion avec de nouvelles perspectives ou arguments.`;
}

function computeTokensPerAgent(messages: Message[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const msg of messages) {
    if (!msg.isUser && !msg.isSynthesis && msg.tokenCount) {
      result[msg.agentId] = (result[msg.agentId] || 0) + msg.tokenCount;
    }
  }
  return result;
}
