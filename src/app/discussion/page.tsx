"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SessionConfig, Message, ApiKeys, OrchestratorDecision, VoteResult, DiscussionState } from "@/lib/types";
import { estimateCost } from "@/lib/types";
import { buildSlidingContext } from "@/lib/store";
import MessageBubble from "@/components/MessageBubble";
import TypingIndicator from "@/components/TypingIndicator";
import { exportToMarkdown, downloadMarkdown } from "@/lib/export";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { v4 as uuidv4 } from "uuid";

export default function DiscussionPage() {
  const router = useRouter();
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [userInput, setUserInput] = useState("");
  const [turnNumber, setTurnNumber] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalInputTokens, setTotalInputTokens] = useState(0);
  const [estimatedCostUsd, setEstimatedCostUsd] = useState(0);
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [discussionState, setDiscussionState] = useState<DiscussionState>("active");
  const [votes, setVotes] = useState<VoteResult[]>([]);
  const [interventionType, setInterventionType] = useState<"message" | "recadrer" | "relancer">("message");
  const [copied, setCopied] = useState(false);
  const lang = config?.rules.language === "fr" ? "fr-FR" : "en-US";
  const { isListening, isSupported: micSupported, startListening, stopListening } = useSpeechRecognition(lang);
  const voiceToInput = useCallback(() => {
    if (isListening) { stopListening(); return; }
    startListening((text) => setUserInput((prev) => prev ? prev + " " + text : text));
  }, [isListening, startListening, stopListening]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userHasScrolledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pauseRef = useRef(false);
  const userMessagesRef = useRef<Message[]>([]);

  useEffect(() => { pauseRef.current = isPaused; }, [isPaused]);

  // Smart auto-scroll: only scroll down if user is near the bottom
  const scrollToBottom = useCallback(() => {
    if (!userHasScrolledRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingContent, scrollToBottom]);

  // Detect user scroll: if they scroll up, stop auto-scrolling; if back at bottom, resume
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userHasScrolledRef.current = distanceFromBottom > 150;
  }, []);

  useEffect(() => {
    const configStr = sessionStorage.getItem("ai-arena-config");
    const keysStr = sessionStorage.getItem("ai-arena-api-keys");
    if (!configStr) { router.push("/"); return; }
    try {
      setConfig(JSON.parse(configStr));
      if (keysStr) setApiKeys(JSON.parse(keysStr));
    } catch { router.push("/"); }
  }, [router]);

  const getApiKey = useCallback((provider: string): string => {
    if (provider === "openai") return apiKeys.openai || "";
    if (provider === "gemini") return apiKeys.gemini || "";
    return apiKeys.claude || "";
  }, [apiKeys]);

  const callAgent = useCallback(
    async (
      agentConfig: SessionConfig["agents"][0],
      instruction: string,
      history: Message[],
    ): Promise<{ content: string; outputTokens: number; inputTokens: number }> => {
      const apiKey = getApiKey(agentConfig.provider);
      const systemPrompt = agentConfig.systemPrompt || buildSystemPrompt(agentConfig, config!);

      // Use sliding context for long discussions
      const contextHistory = buildSlidingContext(history);

      const response = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: agentConfig.provider,
          apiKey,
          model: agentConfig.model,
          systemPrompt,
          turnInstruction: instruction,
          history: contextHistory,
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
      let outputTokens = 0;
      let inputTokens = 0;

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
                outputTokens = parsed.outputTokens || 0;
                inputTokens = parsed.inputTokens || 0;
              } else if (parsed.type === "error") {
                throw new Error(parsed.message);
              }
            } catch (e) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
            }
          }
        }
      }

      setCurrentSpeaker(null);
      setStreamingContent("");
      return { content: fullContent, outputTokens, inputTokens };
    },
    [config, getApiKey]
  );

  const callOrchestrator = useCallback(
    async (history: Message[], turn: number): Promise<OrchestratorDecision> => {
      if (!config) throw new Error("No config");
      const claudeKey = apiKeys.claude || "";
      if (!claudeKey) {
        // Fallback round-robin if no Claude key for orchestrator
        const agentIndex = (turn - 1) % config.agents.length;
        return {
          nextSpeaker: config.agents[agentIndex].id,
          instruction: "Continue la discussion.",
          discussionState: turn >= config.rules.maxTurns * 0.9 ? "ready_to_conclude" : "active",
          keyPointsSoFar: [],
          turnNumber: turn,
        };
      }

      try {
        const contextHistory = buildSlidingContext(history, 15);
        const response = await fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: claudeKey,
            topic: config.topic,
            mode: config.mode,
            agents: config.agents.map((a) => ({
              id: a.id, name: a.name, role: a.role, personality: a.personality, stance: a.stance,
            })),
            history: contextHistory,
            turnNumber: turn,
            maxTurns: config.rules.maxTurns,
            language: config.rules.language,
          }),
          signal: abortRef.current?.signal,
        });

        if (!response.ok) throw new Error("Orchestrator failed");
        const decision = await response.json();
        return { ...decision, turnNumber: turn };
      } catch {
        // Fallback round-robin
        const agentIndex = (turn - 1) % config.agents.length;
        return {
          nextSpeaker: config.agents[agentIndex].id,
          instruction: "Continue la discussion avec ton point de vue.",
          discussionState: "active" as DiscussionState,
          keyPointsSoFar: [],
          turnNumber: turn,
        };
      }
    },
    [config, apiKeys]
  );

  const runVoting = useCallback(
    async (allMessages: Message[]): Promise<VoteResult[]> => {
      if (!config) return [];
      const voteResults: VoteResult[] = [];

      for (const agent of config.agents) {
        const apiKey = getApiKey(agent.provider);
        const contextHistory = buildSlidingContext(allMessages, 10);

        const voteInstruction = `La phase de debat est terminee. Tu dois maintenant VOTER.
Donne ta decision finale sous forme structuree :
1. TON VOTE : une reponse claire et directe a la question/sujet
2. TES ARGUMENTS : les 2-3 arguments principaux qui justifient ta position
Sois concis et tranche.`;

        const systemPrompt = buildSystemPrompt(agent, config) +
          "\n\nIMPORTANT: C'est la phase de vote final. Tu dois donner une reponse claire et argumentee.";

        try {
          const response = await fetch("/api/orchestrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: agent.provider,
              apiKey,
              model: agent.model,
              systemPrompt,
              turnInstruction: voteInstruction,
              history: contextHistory,
              topic: config.topic,
              maxTokens: 400,
            }),
            signal: abortRef.current?.signal,
          });

          if (!response.ok) continue;

          const reader = response.body?.getReader();
          if (!reader) continue;

          const decoder = new TextDecoder();
          let voteContent = "";

          setCurrentSpeaker(agent.id);
          setStreamingContent("");

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split("\n")) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === "content") {
                    voteContent += parsed.text;
                    setStreamingContent(voteContent);
                  }
                } catch { /* skip */ }
              }
            }
          }

          const voteMsg: Message = {
            id: uuidv4(),
            agentId: agent.id,
            agentName: agent.name,
            agentColor: agent.color,
            provider: agent.provider,
            content: voteContent,
            turnNumber: 999,
            timestamp: Date.now(),
            isVote: true,
          };

          allMessages.push(voteMsg);
          setMessages([...allMessages]);

          voteResults.push({
            agentId: agent.id,
            agentName: agent.name,
            vote: voteContent.slice(0, 200),
            reasoning: voteContent,
          });
        } catch { /* skip on error */ }
      }

      setCurrentSpeaker(null);
      setStreamingContent("");
      return voteResults;
    },
    [config, getApiKey]
  );

  const generateFinalOutput = useCallback(
    async (allMessages: Message[], outputType: "synthesis" | "deliverable"): Promise<string> => {
      if (!config) return "";
      const claudeKey = apiKeys.claude || getApiKey(config.agents[0].provider);
      const model = config.agents[0].model;
      const contextHistory = buildSlidingContext(allMessages, 25);
      const lang = config.rules.language === "fr" ? "francais" : "anglais";

      const prompts: Record<string, { system: string; instruction: string }> = {
        synthesis: {
          system: `Tu es un expert en synthese de discussions. Produis une synthese structuree et actionnable. Identifie les points cles, les zones de consensus, les desaccords, et les conclusions principales. Reponds en ${lang}.`,
          instruction: "Produis la synthese finale de cette discussion.",
        },
        deliverable: {
          system: `Tu es un expert en redaction. A partir de la discussion suivante, produis le LIVRABLE FINAL demande. Le document doit etre structure, complet et directement utilisable. Integre les meilleures contributions de chaque participant. Reponds en ${lang}.`,
          instruction: `Produis le livrable final sur le sujet "${config.topic}". Le document doit etre structure, complet et integrer les contributions des participants.`,
        },
      };

      const { system, instruction } = prompts[outputType];

      setCurrentSpeaker(outputType === "deliverable" ? "deliverable" : "synthesis");
      setStreamingContent("");

      const response = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.agents[0].provider,
          apiKey: claudeKey,
          model,
          systemPrompt: system,
          turnInstruction: instruction,
          history: contextHistory,
          topic: config.topic,
          maxTokens: 1500,
        }),
      });

      if (!response.ok) return "";

      const reader = response.body?.getReader();
      if (!reader) return "";

      const decoder = new TextDecoder();
      let content = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content") {
                content += parsed.text;
                setStreamingContent(content);
              }
            } catch { /* skip */ }
          }
        }
      }

      setCurrentSpeaker(null);
      setStreamingContent("");
      return content;
    },
    [config, apiKeys, getApiKey]
  );

  const runDiscussion = useCallback(async () => {
    if (!config) return;
    setIsRunning(true);
    setError(null);
    abortRef.current = new AbortController();

    const allMessages: Message[] = [];
    let currentTurn = 0;
    let tokensUsed = 0;
    let inputTokensUsed = 0;
    let costAccumulated = 0;

    try {
      for (let turn = 0; turn < config.rules.maxTurns; turn++) {
        currentTurn = turn + 1;
        setTurnNumber(currentTurn);

        // Check pause
        while (pauseRef.current) {
          await new Promise((r) => setTimeout(r, 500));
        }
        if (abortRef.current?.signal.aborted) throw new Error("Discussion arretee");

        // Ask orchestrator who speaks next
        const decision = await callOrchestrator(allMessages, currentTurn);
        setDiscussionState(decision.discussionState);
        if (decision.keyPointsSoFar?.length) setKeyPoints(decision.keyPointsSoFar);

        // Check if discussion should end early
        if (decision.discussionState === "ready_to_conclude" && currentTurn > 3) {
          break;
        }

        // Get the chosen agent
        const agent = config.agents.find((a) => a.id === decision.nextSpeaker) || config.agents[turn % config.agents.length];

        // Include pending user messages
        const pendingUserMessages = userMessagesRef.current;
        if (pendingUserMessages.length > 0) {
          allMessages.push(...pendingUserMessages);
          setMessages([...allMessages]);
          userMessagesRef.current = [];
        }

        const { content, outputTokens, inputTokens } = await callAgent(agent, decision.instruction, allMessages);

        tokensUsed += outputTokens;
        inputTokensUsed += inputTokens;
        const turnCost = estimateCost(agent.model, inputTokens, outputTokens);
        costAccumulated += turnCost;
        setTotalTokens(tokensUsed);
        setTotalInputTokens(inputTokensUsed);
        setEstimatedCostUsd(costAccumulated);

        const message: Message = {
          id: uuidv4(),
          agentId: agent.id,
          agentName: agent.name,
          agentColor: agent.color,
          provider: agent.provider,
          content,
          turnNumber: currentTurn,
          timestamp: Date.now(),
          tokenCount: outputTokens,
          inputTokens,
        };
        allMessages.push(message);
        setMessages([...allMessages]);
      }

      // Mode-specific endings
      let voteResults: VoteResult[] = [];
      let deliverableContent = "";

      if (config.mode === "decision") {
        // Run voting phase
        voteResults = await runVoting(allMessages);
        setVotes(voteResults);
      }

      if (config.mode === "deliverable") {
        deliverableContent = await generateFinalOutput(allMessages, "deliverable");
        const delivMsg: Message = {
          id: uuidv4(),
          agentId: "deliverable",
          agentName: "Livrable",
          agentColor: "#10B981",
          content: deliverableContent,
          turnNumber: currentTurn + 1,
          timestamp: Date.now(),
          isDeliverable: true,
        };
        allMessages.push(delivMsg);
        setMessages([...allMessages]);
      }

      // Generate synthesis
      const synthesis = await generateFinalOutput(allMessages, "synthesis");
      const synthMsg: Message = {
        id: uuidv4(),
        agentId: "synthesis",
        agentName: "Synthese",
        agentColor: "#3B82F6",
        content: synthesis,
        turnNumber: currentTurn + 2,
        timestamp: Date.now(),
        isSynthesis: true,
      };
      allMessages.push(synthMsg);
      setMessages([...allMessages]);

      // Store results
      const result = {
        messages: allMessages,
        synthesis,
        keyPoints,
        votes: voteResults,
        deliverable: deliverableContent || undefined,
        metrics: {
          totalTurns: currentTurn,
          tokensPerAgent: computeTokensPerAgent(allMessages),
          totalTokens: tokensUsed,
          totalInputTokens: inputTokensUsed,
          estimatedCost: costAccumulated,
          duration: 0,
        },
      };
      sessionStorage.setItem("ai-arena-result", JSON.stringify(result));

    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") { /* ok */ }
      else setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsRunning(false);
      setCurrentSpeaker(null);
      setStreamingContent("");
    }
  }, [config, callAgent, callOrchestrator, runVoting, generateFinalOutput, keyPoints]);

  useEffect(() => {
    if (config && !isRunning && messages.length === 0 && !error) {
      sessionStorage.setItem("ai-arena-start-time", String(Date.now()));
      runDiscussion();
    }
  }, [config, isRunning, messages.length, error, runDiscussion]);

  const handlePause = () => setIsPaused(!isPaused);
  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort();
    setIsRunning(false);
    // Auto-save partial results so user can view them
    if (config && messages.length > 0) {
      const startTime = Number(sessionStorage.getItem("ai-arena-start-time") || Date.now());
      const result = {
        messages,
        synthesis: messages.find((m) => m.isSynthesis)?.content || "Discussion arretee avant la synthese.",
        keyPoints,
        votes,
        deliverable: messages.find((m) => m.isDeliverable)?.content || undefined,
        metrics: {
          totalTurns: turnNumber,
          tokensPerAgent: computeTokensPerAgent(messages),
          totalTokens,
          totalInputTokens,
          estimatedCost: estimatedCostUsd,
          duration: Date.now() - startTime,
        },
      };
      sessionStorage.setItem("ai-arena-result", JSON.stringify(result));
    }
  };

  const handleUserIntervention = () => {
    if (!userInput.trim() || !config) return;

    let content = userInput.trim();
    if (interventionType === "recadrer") {
      content = `[RECADRAGE] ${content}`;
    } else if (interventionType === "relancer") {
      content = `[RELANCE] ${content}`;
    }

    const userMessage: Message = {
      id: uuidv4(),
      agentId: "user",
      agentName: "Utilisateur",
      agentColor: "#6B7280",
      content,
      turnNumber: turnNumber,
      timestamp: Date.now(),
      isUser: true,
    };
    userMessagesRef.current.push(userMessage);
    setMessages((prev) => [...prev, userMessage]);
    setUserInput("");
  };

  const requestIntermediateSynthesis = async () => {
    if (!config || !isRunning) return;
    const synthContent = await generateFinalOutput(messages, "synthesis");
    const synthMsg: Message = {
      id: uuidv4(),
      agentId: "synthesis-intermediate",
      agentName: "Synthese intermediaire",
      agentColor: "#8B5CF6",
      content: synthContent,
      turnNumber: turnNumber,
      timestamp: Date.now(),
      isSynthesis: true,
    };
    setMessages((prev) => [...prev, synthMsg]);
  };

  const forceVote = async () => {
    if (!config || !isRunning) return;
    handleStop();
    // Trigger early vote
    const voteResults = await runVoting(messages);
    setVotes(voteResults);
    const synthesis = await generateFinalOutput(messages, "synthesis");
    const synthMsg: Message = {
      id: uuidv4(),
      agentId: "synthesis",
      agentName: "Synthese",
      agentColor: "#3B82F6",
      content: synthesis,
      turnNumber: turnNumber + 1,
      timestamp: Date.now(),
      isSynthesis: true,
    };
    setMessages((prev) => [...prev, synthMsg]);
  };

  const forceDeliverable = async () => {
    if (!config || !isRunning) return;
    handleStop();
    const deliverable = await generateFinalOutput(messages, "deliverable");
    const delivMsg: Message = {
      id: uuidv4(),
      agentId: "deliverable",
      agentName: "Livrable",
      agentColor: "#10B981",
      content: deliverable,
      turnNumber: turnNumber + 1,
      timestamp: Date.now(),
      isDeliverable: true,
    };
    setMessages((prev) => [...prev, delivMsg]);
  };

  const buildResult = useCallback(() => {
    const startTime = Number(sessionStorage.getItem("ai-arena-start-time") || Date.now());
    return {
      messages,
      synthesis: messages.find((m) => m.isSynthesis)?.content || "",
      keyPoints,
      votes,
      deliverable: messages.find((m) => m.isDeliverable)?.content || undefined,
      metrics: {
        totalTurns: turnNumber,
        tokensPerAgent: computeTokensPerAgent(messages),
        totalTokens,
        totalInputTokens,
        estimatedCost: estimatedCostUsd,
        duration: Date.now() - startTime,
      },
    };
  }, [messages, keyPoints, votes, turnNumber, totalTokens, totalInputTokens, estimatedCostUsd]);

  const goToResults = () => {
    const result = buildResult();
    sessionStorage.setItem("ai-arena-result", JSON.stringify(result));
    router.push("/results");
  };

  const handleCopyAll = async () => {
    if (!config) return;
    const result = buildResult();
    const md = exportToMarkdown(config, result);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMd = () => {
    if (!config) return;
    const result = buildResult();
    const md = exportToMarkdown(config, result);
    const slug = config.topic.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
    downloadMarkdown(md, `ai-arena-${slug}.md`);
  };

  const handleContinue = useCallback(async () => {
    if (!config || isRunning) return;
    // Add 5 more turns
    const extendedConfig = {
      ...config,
      rules: { ...config.rules, maxTurns: config.rules.maxTurns + 5 },
    };
    setConfig(extendedConfig);
    sessionStorage.setItem("ai-arena-config", JSON.stringify(extendedConfig));

    setIsRunning(true);
    setError(null);
    abortRef.current = new AbortController();

    const allMessages = [...messages];
    let currentTurn = turnNumber;
    let tokensUsed = totalTokens;
    let inputTokensUsed = totalInputTokens;
    let costAccumulated = estimatedCostUsd;

    try {
      for (let i = 0; i < 5; i++) {
        currentTurn += 1;
        setTurnNumber(currentTurn);

        while (pauseRef.current) {
          await new Promise((r) => setTimeout(r, 500));
        }
        if (abortRef.current?.signal.aborted) throw new Error("Discussion arretee");

        const decision = await callOrchestrator(allMessages, currentTurn);
        setDiscussionState(decision.discussionState);
        if (decision.keyPointsSoFar?.length) setKeyPoints(decision.keyPointsSoFar);

        if (decision.discussionState === "ready_to_conclude") break;

        const agent = config.agents.find((a) => a.id === decision.nextSpeaker) || config.agents[i % config.agents.length];

        const pendingUserMessages = userMessagesRef.current;
        if (pendingUserMessages.length > 0) {
          allMessages.push(...pendingUserMessages);
          setMessages([...allMessages]);
          userMessagesRef.current = [];
        }

        const { content, outputTokens, inputTokens } = await callAgent(agent, decision.instruction, allMessages);

        tokensUsed += outputTokens;
        inputTokensUsed += inputTokens;
        const turnCost = estimateCost(agent.model, inputTokens, outputTokens);
        costAccumulated += turnCost;
        setTotalTokens(tokensUsed);
        setTotalInputTokens(inputTokensUsed);
        setEstimatedCostUsd(costAccumulated);

        const message: Message = {
          id: uuidv4(),
          agentId: agent.id,
          agentName: agent.name,
          agentColor: agent.color,
          provider: agent.provider,
          content,
          turnNumber: currentTurn,
          timestamp: Date.now(),
          tokenCount: outputTokens,
          inputTokens,
        };
        allMessages.push(message);
        setMessages([...allMessages]);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") { /* ok */ }
      else setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsRunning(false);
      setCurrentSpeaker(null);
      setStreamingContent("");
    }
  }, [config, isRunning, messages, turnNumber, totalTokens, totalInputTokens, estimatedCostUsd, callAgent, callOrchestrator]);

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted">Chargement...</div>
      </div>
    );
  }

  const currentAgent = config.agents.find((a) => a.id === currentSpeaker);
  const modeLabels: Record<string, string> = { exploration: "Exploration", decision: "Decision", deliverable: "Livrable" };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")} className="rounded-lg p-1.5 text-muted transition-colors hover:text-foreground">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold">AI Arena</h1>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  config.mode === "decision" ? "bg-amber-500/10 text-amber-500"
                    : config.mode === "deliverable" ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-accent/10 text-accent"
                }`}>
                  {modeLabels[config.mode]}
                </span>
              </div>
              <p className="max-w-md truncate text-xs text-muted">{config.topic}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>Tour {turnNumber}/{config.rules.maxTurns}</span>
              <span className="text-border">|</span>
              <span>{totalTokens} tok</span>
              <span className="text-border">|</span>
              <span className="font-mono">${estimatedCostUsd.toFixed(4)}</span>
              <span className="text-border">|</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                discussionState === "active" ? "bg-success/10 text-success"
                  : discussionState === "stalling" ? "bg-danger/10 text-danger"
                    : discussionState === "converging" ? "bg-amber-500/10 text-amber-500"
                      : "bg-accent/10 text-accent"
              }`}>
                {isRunning ? (isPaused ? "Pause" : discussionState === "converging" ? "Convergence" : discussionState === "stalling" ? "Stagne" : "En cours") : "Termine"}
              </span>
            </div>
            {isRunning && (
              <div className="flex gap-2">
                <button onClick={handlePause} className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:border-border-hover">
                  {isPaused ? "Reprendre" : "Pause"}
                </button>
                {config.mode === "decision" && (
                  <button onClick={forceVote} className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs text-amber-500 transition-colors hover:bg-amber-500/10">
                    Voter
                  </button>
                )}
                {config.mode === "deliverable" && (
                  <button onClick={forceDeliverable} className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-500 transition-colors hover:bg-emerald-500/10">
                    Livrable
                  </button>
                )}
                <button onClick={handleStop} className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs text-danger transition-colors hover:bg-danger/10">
                  Arreter
                </button>
              </div>
            )}
            {!isRunning && messages.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleCopyAll}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                  title="Copier tous les echanges"
                >
                  {copied ? (
                    <span className="flex items-center gap-1 text-success">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Copie
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      Copier
                    </span>
                  )}
                </button>
                <button
                  onClick={handleDownloadMd}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                  title="Telecharger en Markdown"
                >
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    .md
                  </span>
                </button>
                <button
                  onClick={handleContinue}
                  className="rounded-lg border border-accent/30 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
                  title="Continuer la discussion (+5 tours)"
                >
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Continuer
                  </span>
                </button>
                <button onClick={goToResults} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover">
                  Resultats
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Agent badges */}
        <div className="flex gap-2 overflow-x-auto px-6 pb-3">
          {config.agents.map((agent) => (
            <div
              key={agent.id}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs transition-all ${currentSpeaker === agent.id ? "border-transparent" : "border-border"}`}
              style={currentSpeaker === agent.id ? { borderColor: agent.color, backgroundColor: agent.color + "15" } : {}}
            >
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: agent.color }} />
              <span style={currentSpeaker === agent.id ? { color: agent.color } : {}}>{agent.name}</span>
              <span className="text-[10px] text-muted">{agent.provider === "openai" ? "OAI" : agent.provider === "gemini" ? "Gem" : ""}</span>
            </div>
          ))}
        </div>
      </header>

      {/* Key points sidebar (if any) */}
      <div className="flex flex-1 overflow-hidden">
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {/* Streaming content */}
          {currentSpeaker && !["synthesis", "deliverable"].includes(currentSpeaker || "") && currentAgent && streamingContent && (
            <div className="animate-fade-in-up mx-4 my-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: currentAgent.color }}>
                  {currentAgent.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: currentAgent.color }}>{currentAgent.name}</span>
                    <span className="text-xs text-muted">Tour {turnNumber}</span>
                  </div>
                  <div className="rounded-xl rounded-tl-sm border px-4 py-3" style={{ borderColor: currentAgent.color + "40" }}>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{streamingContent}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Synthesis/Deliverable streaming */}
          {(currentSpeaker === "synthesis" || currentSpeaker === "deliverable") && streamingContent && (
            <div className={`animate-fade-in-up mx-4 my-4 rounded-xl border p-5 ${currentSpeaker === "deliverable" ? "border-emerald-500/30 bg-emerald-500/5" : "border-accent/30 bg-accent/5"}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`font-semibold ${currentSpeaker === "deliverable" ? "text-emerald-500" : "text-accent"}`}>
                  {currentSpeaker === "deliverable" ? "Generation du livrable..." : "Synthese en cours..."}
                </span>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{streamingContent}</div>
            </div>
          )}

          {currentSpeaker && !streamingContent && currentAgent && (
            <TypingIndicator agentName={currentAgent.name} agentColor={currentAgent.color} />
          )}

          {error && (
            <div className="mx-4 my-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
          )}

          {/* End-of-discussion action bar inline */}
          {!isRunning && messages.length > 0 && (
            <div className="mx-4 my-6 animate-fade-in-up rounded-xl border border-accent/30 bg-accent/5 p-5">
              <p className="mb-4 text-center text-sm font-semibold text-accent">Discussion terminee</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handleCopyAll}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm transition-colors hover:border-accent hover:text-accent"
                >
                  {copied ? (
                    <>
                      <svg className="h-4 w-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      <span className="text-success">Copie !</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      Copier les echanges
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownloadMd}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm transition-colors hover:border-accent hover:text-accent"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Telecharger .md
                </button>
                <button
                  onClick={handleContinue}
                  className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-accent transition-colors hover:bg-accent/20"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Continuer (+5 tours)
                </button>
                <button
                  onClick={goToResults}
                  className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                >
                  Voir les resultats
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Key points sidebar */}
        {keyPoints.length > 0 && (
          <div className="hidden w-72 shrink-0 border-l border-border p-4 lg:block">
            <h3 className="mb-3 text-xs font-semibold text-muted uppercase">Points cles</h3>
            <div className="space-y-2">
              {keyPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="text-muted">{point}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User input */}
      {config.userMode !== "observer" && (
        <div className="shrink-0 border-t border-border px-6 py-3">
          <div className="flex gap-2">
            <select
              value={interventionType}
              onChange={(e) => setInterventionType(e.target.value as typeof interventionType)}
              className="shrink-0 rounded-lg border border-border bg-card px-2 py-2 text-xs outline-none focus:border-accent"
            >
              <option value="message">Message</option>
              <option value="recadrer">Recadrer</option>
              <option value="relancer">Relancer</option>
            </select>
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUserIntervention()}
              className="flex-1 rounded-lg border border-border bg-card px-4 py-2 text-sm outline-none focus:border-accent"
              placeholder={
                interventionType === "recadrer" ? "Recadrer la discussion vers..."
                  : interventionType === "relancer" ? "Relancer sur un nouveau point..."
                    : "Intervenir dans la discussion..."
              }
            />
            {micSupported && (
              <button
                type="button"
                onClick={voiceToInput}
                className={`shrink-0 rounded-lg p-2 transition-colors ${
                  isListening ? "bg-danger/10 text-danger animate-pulse" : "text-muted hover:text-accent hover:bg-accent/10"
                }`}
                title={isListening ? "Arreter l'ecoute" : "Dicter un message"}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8m-4-12a3 3 0 00-3 3v4a3 3 0 006 0V8a3 3 0 00-3-3z" />
                </svg>
              </button>
            )}
            <button
              onClick={handleUserIntervention}
              disabled={!userInput.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              Envoyer
            </button>
            {isRunning && (
              <button
                onClick={requestIntermediateSynthesis}
                className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                title="Demander une synthese intermediaire"
              >
                Synthese
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function buildSystemPrompt(agent: SessionConfig["agents"][0], config: SessionConfig): string {
  const modeInstr = {
    exploration: "Discussion ouverte et exploratoire.",
    decision: `Debat contradictoire. ${agent.stance === "pour" ? "Tu DEFENDS la position." : agent.stance === "contre" ? "Tu ATTAQUES la position." : "Tu es NEUTRE et analyses les deux cotes."}`,
    deliverable: "Discussion orientee vers la production d'un livrable concret. Concentre-toi sur les contributions constructives.",
  };

  return `Tu participes a une discussion de groupe sur le sujet suivant :
${config.topic}

${config.additionalContext ? `Contexte additionnel : ${config.additionalContext}` : ""}

Mode : ${modeInstr[config.mode]}

Ton role : ${agent.role || "Participant"}
Ta personnalite : ${agent.personality || "Neutre et constructif"}
${agent.stance ? `Ta position initiale : ${agent.stance}` : ""}

Regles de la discussion :
- Reponds de maniere concise et percutante, mais termine toujours tes idees
- Adresse-toi directement aux autres participants par leur nom
- Fais avancer la discussion : ne repete pas ce qui a ete dit
- Si tu es d'accord avec un point, dis-le brievement et ajoute de la valeur
- Si tu n'es pas d'accord, argumente avec des faits ou un raisonnement
- Langue : ${config.rules.language === "fr" ? "francais" : "anglais"}`;
}

function computeTokensPerAgent(messages: Message[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const msg of messages) {
    if (!msg.isUser && !msg.isSynthesis && !msg.isDeliverable && msg.tokenCount) {
      result[msg.agentId] = (result[msg.agentId] || 0) + msg.tokenCount;
    }
  }
  return result;
}
