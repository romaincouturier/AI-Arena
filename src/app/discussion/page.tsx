"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SessionConfig, Message, ApiKeys, OrchestratorDecision, VoteResult, DiscussionState } from "@/lib/types";
import { estimateCost } from "@/lib/types";
import { buildSlidingContext } from "@/lib/store";
import MessageBubble from "@/components/MessageBubble";
import TypingIndicator from "@/components/TypingIndicator";
import { exportToMarkdown, downloadMarkdown } from "@/lib/export";
import { saveSession } from "@/lib/history";
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
  const [rating, setRating] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
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
  const [waitingForUser, setWaitingForUser] = useState(false);
  const continueResolverRef = useRef<((overrideAgentId?: string) => void) | null>(null);
  const [nextSpeakerSuggestion, setNextSpeakerSuggestion] = useState<{ agentId: string; agentName: string; instruction: string } | null>(null);

  useEffect(() => { pauseRef.current = isPaused; }, [isPaused]);

  // Step-by-step: pause after each agent turn and wait for user to continue
  // Returns an optional override agent ID if user picks a different speaker
  const waitForUserContinue = useCallback((suggestion?: { agentId: string; agentName: string; instruction: string }): Promise<string | undefined> => {
    return new Promise((resolve) => {
      continueResolverRef.current = resolve as (overrideAgentId?: string) => void;
      setNextSpeakerSuggestion(suggestion || null);
      setWaitingForUser(true);
    });
  }, []);

  const handleContinueStep = useCallback((overrideAgentId?: string) => {
    // If user typed something, inject it as a message first
    if (userInput.trim() && config) {
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
    }
    // Reset auto-scroll so next agent response scrolls into view
    userHasScrolledRef.current = false;
    setWaitingForUser(false);
    setNextSpeakerSuggestion(null);
    if (continueResolverRef.current) {
      continueResolverRef.current(overrideAgentId);
      continueResolverRef.current = null;
    }
  }, [userInput, config, turnNumber]);

  // Smart auto-scroll: only scroll down if user is near the bottom
  const scrollToBottom = useCallback(() => {
    if (!userHasScrolledRef.current) {
      // Use rAF to ensure DOM is painted before scrolling
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      });
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingContent, scrollToBottom]);

  // Detect user scroll: if they scroll up, stop auto-scrolling; if back at bottom, resume
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Only consider user as "scrolled away" if they are far from bottom
    userHasScrolledRef.current = distanceFromBottom > 400;
  }, []);

  useEffect(() => {
    const configStr = sessionStorage.getItem("ai-arena-config");
    const keysStr = sessionStorage.getItem("ai-arena-api-keys") || localStorage.getItem("ai-arena-api-keys");
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

  // Stream an SSE response and collect content + usage
  const streamResponse = useCallback(
    async (
      response: Response,
      agentId: string,
      existingContent: string = "",
    ): Promise<{ content: string; outputTokens: number; inputTokens: number }> => {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let fullContent = existingContent;
      let outputTokens = 0;
      let inputTokens = 0;

      setCurrentSpeaker(agentId);
      if (!existingContent) {
        setStreamingContent("");
        // Reset auto-scroll when a new agent starts speaking
        userHasScrolledRef.current = false;
      }

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

      return { content: fullContent, outputTokens, inputTokens };
    },
    []
  );

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

      let result = await streamResponse(response, agentConfig.id);

      // Auto-continuation: detect truncated responses and ask the agent to finish
      if (looksIncomplete(result.content)) {
        const contResponse = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: agentConfig.provider,
            apiKey,
            model: agentConfig.model,
            systemPrompt: systemPrompt + "\n\nIMPORTANT: Tu continues ta reponse precedente qui a ete coupee. Ne repete pas ce qui est deja dit. Termine ton point en quelques phrases.",
            turnInstruction: `Continue directement la suite de ton texte. Voici comment ta reponse se terminait : "...${result.content.slice(-200)}"`,
            history: contextHistory,
            topic: config!.topic,
            maxTokens: 600,
          }),
          signal: abortRef.current?.signal,
        });

        if (contResponse.ok) {
          const contResult = await streamResponse(contResponse, agentConfig.id, result.content);
          result = {
            content: contResult.content,
            outputTokens: result.outputTokens + contResult.outputTokens,
            inputTokens: result.inputTokens + contResult.inputTokens,
          };
        }
      }

      setCurrentSpeaker(null);
      setStreamingContent("");
      return result;
    },
    [config, getApiKey, streamResponse]
  );

  const callOrchestrator = useCallback(
    async (history: Message[], turn: number): Promise<OrchestratorDecision> => {
      if (!config) throw new Error("No config");
      // Pick the best available key for the orchestrator
      const orchKey = apiKeys.claude || apiKeys.openai || apiKeys.gemini || "";
      const orchProvider = apiKeys.claude ? "claude" : apiKeys.openai ? "openai" : apiKeys.gemini ? "gemini" : "claude";
      if (!orchKey) {
        // Fallback round-robin if no key at all
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
            apiKey: orchKey,
            provider: orchProvider,
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
      const finalKey = getApiKey(config.agents[0].provider) || apiKeys.claude || apiKeys.openai || apiKeys.gemini || "";
      const model = config.agents[0].model;
      const contextHistory = buildSlidingContext(allMessages, 25);
      const lang = config.rules.language === "fr" ? "francais" : "anglais";

      const prompts: Record<string, { system: string; instruction: string; tokens: number }> = {
        synthesis: {
          system: `Tu es un expert en synthese de discussions de groupe. Produis une synthese STRUCTUREE et ACTIONNABLE. Reponds en ${lang}.

Ta synthese doit contenir :
1. RESUME EXECUTIF (3-5 lignes) : la reponse a la question de depart en une phrase, puis les conclusions cles
2. POINTS DE CONSENSUS : ce sur quoi tous les experts sont d'accord
3. POINTS DE DESACCORD : les positions divergentes et pourquoi
4. RECOMMANDATIONS CONCRETES : les 3-5 actions a retenir
5. QUESTIONS OUVERTES : ce qui reste a explorer

IMPORTANT : Si un livrable a deja ete produit, NE PAS repeter son contenu. Concentre-toi sur les dynamiques de la discussion et les meta-enseignements.`,
          instruction: `Produis la synthese finale de cette discussion sur "${config.topic}". Rappel : reponds au SUJET CENTRAL, pas aux tangentes.`,
          tokens: 2500,
        },
        deliverable: {
          system: `Tu es un expert en redaction de documents professionnels. A partir de la discussion suivante, produis le LIVRABLE FINAL demande. Reponds en ${lang}.

REGLES CRITIQUES pour le livrable :
1. Le document DOIT repondre directement au SUJET CENTRAL de la discussion
2. Structure avec des titres clairs (##), des sous-sections, et des points actionables
3. Integre les MEILLEURES contributions de chaque participant — cite-les quand c'est pertinent
4. Le document doit etre COMPLET et DIRECTEMENT UTILISABLE — pas de sections tronquees
5. Termine par des recommandations concretes et des prochaines etapes
6. Ne liste pas tout ce qui a ete dit — SYNTHETISE et STRUCTURE les idees en un document coherent`,
          instruction: `Produis le livrable final et COMPLET sur le sujet "${config.topic}". Le document doit etre structure, exhaustif et directement exploitable. TERMINE toutes les sections — aucune section ne doit etre laissee vide ou tronquee.`,
          tokens: 4000,
        },
      };

      const { system, instruction, tokens } = prompts[outputType];

      setCurrentSpeaker(outputType === "deliverable" ? "deliverable" : "synthesis");
      setStreamingContent("");

      const response = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.agents[0].provider,
          apiKey: finalKey,
          model,
          systemPrompt: system,
          turnInstruction: instruction,
          history: contextHistory,
          topic: config.topic,
          maxTokens: tokens,
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

    let pendingDecision: OrchestratorDecision | null = null;

    try {
      for (let turn = 0; turn < config.rules.maxTurns; turn++) {
        currentTurn = turn + 1;
        setTurnNumber(currentTurn);

        // Check pause
        while (pauseRef.current) {
          await new Promise((r) => setTimeout(r, 500));
        }
        if (abortRef.current?.signal.aborted) throw new Error("Discussion arretee");

        // Use pending decision from previous step-by-step, or ask orchestrator
        let decision: OrchestratorDecision;
        if (pendingDecision) {
          decision = pendingDecision;
          pendingDecision = null;
        } else {
          decision = await callOrchestrator(allMessages, currentTurn);
        }
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

        // Step-by-step: get next speaker recommendation, then wait for user
        if (turn < config.rules.maxTurns - 1) {
          // Pre-fetch orchestrator decision for next turn to show recommendation
          const nextDecision = await callOrchestrator(allMessages, currentTurn + 1);
          const suggestedAgent = config.agents.find((a) => a.id === nextDecision.nextSpeaker);

          const overrideId = await waitForUserContinue(
            suggestedAgent
              ? { agentId: suggestedAgent.id, agentName: suggestedAgent.name, instruction: nextDecision.instruction }
              : undefined
          );
          if (abortRef.current?.signal.aborted) throw new Error("Discussion arretee");

          // If user overrode the speaker, update the decision
          if (overrideId && overrideId !== nextDecision.nextSpeaker) {
            nextDecision.nextSpeaker = overrideId;
            const overrideAgent = config.agents.find((a) => a.id === overrideId);
            nextDecision.instruction = `Donne ton point de vue sur ce qui vient d'etre dit par rapport au sujet central : ${config.topic}`;
            if (overrideAgent) {
              nextDecision.instruction = `${overrideAgent.name}, reagis aux echanges precedents et donne ton point de vue sur le sujet central : ${config.topic}`;
            }
          }
          pendingDecision = nextDecision;
        }
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

      // Auto-save to history
      try { saveSession(config, result); } catch { /* ignore quota errors */ }

    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") { /* ok */ }
      else setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsRunning(false);
      setCurrentSpeaker(null);
      setStreamingContent("");
    }
  }, [config, callAgent, callOrchestrator, runVoting, generateFinalOutput, keyPoints, waitForUserContinue]);

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

        // Step-by-step: wait for user
        if (i < 4) {
          await waitForUserContinue();
          if (abortRef.current?.signal.aborted) throw new Error("Discussion arretee");
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") { /* ok */ }
      else setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsRunning(false);
      setCurrentSpeaker(null);
      setStreamingContent("");
    }
  }, [config, isRunning, messages, turnNumber, totalTokens, totalInputTokens, estimatedCostUsd, callAgent, callOrchestrator, waitForUserContinue]);

  const submitFeedback = useCallback(() => {
    if (rating === null || !config) return;
    const entry = {
      date: new Date().toISOString(),
      topic: config.topic,
      mode: config.mode,
      agents: config.agents.map((a) => ({ name: a.name, model: a.model, provider: a.provider })),
      turns: turnNumber,
      cost: estimatedCostUsd,
      rating,
      feedback: feedbackText.trim() || undefined,
    };
    try {
      const existing = JSON.parse(localStorage.getItem("ai-arena-feedback") || "[]");
      existing.push(entry);
      // Keep last 50 entries
      if (existing.length > 50) existing.splice(0, existing.length - 50);
      localStorage.setItem("ai-arena-feedback", JSON.stringify(existing));
    } catch { /* ignore */ }
    setFeedbackSent(true);
  }, [rating, feedbackText, config, turnNumber, estimatedCostUsd]);

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

              {/* Feedback */}
              <div className="mt-5 border-t border-accent/20 pt-4">
                {feedbackSent ? (
                  <p className="text-center text-xs text-success">Merci pour votre retour !</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-center text-xs text-muted">Comment etait cette discussion ?</p>
                    <div className="flex justify-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setRating(star)}
                          className={`p-1 text-lg transition-colors ${
                            rating !== null && star <= rating ? "text-amber-400" : "text-border hover:text-amber-300"
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    {rating !== null && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && submitFeedback()}
                          className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-accent"
                          placeholder="Un commentaire ? (optionnel)"
                        />
                        <button
                          onClick={submitFeedback}
                          className="rounded-lg bg-accent/20 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/30"
                        >
                          Envoyer
                        </button>
                      </div>
                    )}
                  </div>
                )}
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

      {/* Step-by-step input — always visible during discussion */}
      {isRunning && (
        <div className="shrink-0 border-t border-border px-6 py-3">
          {waitingForUser ? (
            /* Waiting for user: show next speaker recommendation + input */
            <div>
              {/* Next speaker recommendation */}
              {nextSpeakerSuggestion && config && (
                <div className="mb-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-xs font-medium text-amber-400">Prochain interlocuteur suggere</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {config.agents.map((a) => {
                      const isSuggested = a.id === nextSpeakerSuggestion.agentId;
                      return (
                        <button
                          key={a.id}
                          onClick={() => handleContinueStep(a.id)}
                          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                            isSuggested
                              ? "border-accent bg-accent/10 font-semibold text-accent ring-1 ring-accent/30"
                              : "border-border bg-card text-muted hover:border-accent hover:text-foreground"
                          }`}
                          title={isSuggested ? nextSpeakerSuggestion.instruction : `Faire parler ${a.name}`}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} />
                          {a.name}
                          {isSuggested && <span className="text-[9px] text-accent/70">recommande</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* User input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleContinueStep()}
                  className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-accent"
                  placeholder="Ajouter du contexte, corriger une hypothese, recadrer... (optionnel)"
                  autoFocus
                />
                {micSupported && (
                  <button
                    type="button"
                    onClick={voiceToInput}
                    className={`shrink-0 rounded-lg p-2 transition-colors ${
                      isListening ? "bg-danger/10 text-danger animate-pulse" : "text-muted hover:text-accent hover:bg-accent/10"
                    }`}
                    title={isListening ? "Arreter l'ecoute" : "Dicter"}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8m-4-12a3 3 0 00-3 3v4a3 3 0 006 0V8a3 3 0 00-3-3z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => handleContinueStep()}
                  className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  {userInput.trim() ? "Envoyer et continuer" : "Continuer"}
                </button>
              </div>
            </div>
          ) : (
            /* Agent is speaking — show minimal status */
            <div className="flex items-center justify-between text-xs text-muted">
              <span>L&apos;agent repond...</span>
              <button
                onClick={requestIntermediateSynthesis}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
              >
                Synthese intermediaire
              </button>
            </div>
          )}
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

  // Rich expert context
  const expertContext: string[] = [];
  if (agent.frameworks && agent.frameworks.length > 0) {
    expertContext.push(`Tes frameworks et references : ${agent.frameworks.join(", ")}`);
  }
  if (agent.biases) {
    expertContext.push(`Tes biais connus (sois-en conscient) : ${agent.biases}`);
  }
  if (agent.style) {
    expertContext.push(`Ton style de communication : ${agent.style}`);
  }

  // Context files
  const filesContext = agent.contextFiles && agent.contextFiles.length > 0
    ? `\n\nDocuments de reference que tu as lu :\n${agent.contextFiles.map((f) => `--- ${f.name} ---\n${f.content.slice(0, 8000)}`).join("\n\n")}`
    : "";

  return `Tu participes a une discussion de groupe sur le sujet suivant :
${config.topic}

${config.additionalContext ? `Contexte additionnel : ${config.additionalContext}` : ""}

Mode : ${modeInstr[config.mode]}

Ton role : ${agent.role || "Participant"}
Ta personnalite : ${agent.personality || "Neutre et constructif"}
${agent.stance ? `Ta position initiale : ${agent.stance}` : ""}
${expertContext.length > 0 ? `\n${expertContext.join("\n")}` : ""}

Regles de la discussion :
- TERMINE TOUJOURS tes idees — mieux vaut 2 arguments complets que 5 inacheves. Si tu manques de place, conclus plutot que de laisser en suspens.
- REAGIS aux interventions precedentes : cite les noms des autres participants, dis si tu es d'accord ou non, et POURQUOI.
- NE REPETE PAS ce qui a ete dit. Si un point a deja ete fait, dis "comme l'a dit [nom]" et ajoute de la valeur.
- RELIE toujours tes points au SUJET CENTRAL de la discussion. Ne pars pas dans des tangentes.
- Structure ta reponse : commence par ta position claire, puis developpe 2-3 arguments cles. Pas de listes interminables.
- Adresse-toi directement aux autres participants par leur nom.
- Utilise tes frameworks de reference quand c'est pertinent, sans les forcer.
- Langue : ${config.rules.language === "fr" ? "francais" : "anglais"}${filesContext}`;
}

/**
 * Detect if an agent response was cut short (hit the token limit mid-sentence).
 * Returns true if the text appears incomplete.
 */
function looksIncomplete(text: string): boolean {
  if (!text || text.length < 100) return false;
  const trimmed = text.trimEnd();
  // Proper sentence endings
  if (/[.!?:»"\u2019)\]]$/.test(trimmed)) return false;
  // Ends with a markdown heading or list marker (structural ending)
  if (/\n#{1,3}\s+\S.*$/.test(trimmed)) return false;
  // Ends with a complete list item (dash/number + text + period/punctuation)
  if (/[-*]\s+.{10,}[.!?]$/.test(trimmed)) return false;
  // Ends with a closing markdown bold/italic
  if (/\*{1,2}$/.test(trimmed)) return false;
  // Ends with an emoji (common in AI outputs)
  if (/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]$/u.test(trimmed)) return false;
  // The text is likely cut mid-sentence
  return true;
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
