"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import type { SessionConfig, AgentConfig, DiscussionMode, UserMode, ApiKeys, Template } from "@/lib/types";
import { AGENT_COLORS } from "@/lib/types";
import { TEMPLATES } from "@/lib/templates";
import { getSavedSessions, deleteSession, type SavedSession } from "@/lib/history";
import { getCustomTemplates, saveCustomTemplate, deleteCustomTemplate, type CustomTemplate } from "@/lib/customTemplates";
import { EXPERT_POOL, type ExpertProfile } from "@/lib/experts";
import AgentCard from "@/components/AgentCard";
import { createDefaultAgent } from "@/lib/store";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export default function SetupPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [mode, setMode] = useState<DiscussionMode>("exploration");
  const [userMode, setUserMode] = useState<UserMode>("observer");
  const [maxTurns, setMaxTurns] = useState(10);
  const [maxTokensPerTurn, setMaxTokensPerTurn] = useState(800);
  const [language, setLanguage] = useState("fr");
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ claude: "", openai: "", gemini: "" });
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [agents, setAgents] = useState<AgentConfig[]>([
    createDefaultAgent(0),
    createDefaultAgent(1),
  ]);
  const [history, setHistory] = useState<SavedSession[]>([]);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<{ id: string; reason: string; suggestedStance?: string }[]>([]);
  const [showExpertPool, setShowExpertPool] = useState(false);
  const [expertFilter, setExpertFilter] = useState("");
  const [feedbackHistory, setFeedbackHistory] = useState<{ date: string; topic: string; mode: string; rating: number; feedback?: string; cost: number; turns: number }[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // true until localStorage is loaded
  const [isFirstVisit, setIsFirstVisit] = useState(true); // true until we load keys from localStorage

  useEffect(() => {
    setHistory(getSavedSessions());
    setCustomTemplates(getCustomTemplates());
    try {
      const fb = JSON.parse(localStorage.getItem("ai-arena-feedback") || "[]");
      setFeedbackHistory(fb.reverse());
    } catch { /* ignore */ }
    // Load persisted API keys
    try {
      const saved = JSON.parse(localStorage.getItem("ai-arena-api-keys") || "{}");
      if (saved.claude || saved.openai || saved.gemini) {
        setApiKeys(saved);
        setShowApiKeys(false);
        setIsFirstVisit(false);
      } else {
        setShowApiKeys(true);
        setIsFirstVisit(true);
      }
    } catch { setShowApiKeys(true); setIsFirstVisit(true); }
    setIsLoading(false);
  }, []);

  const { isListening, isSupported: micSupported, startListening, stopListening } = useSpeechRecognition(language === "fr" ? "fr-FR" : "en-US");

  const voiceToTopic = useCallback(() => {
    if (isListening) { stopListening(); return; }
    startListening((text) => setTopic((prev) => prev ? prev + " " + text : text));
  }, [isListening, startListening, stopListening]);

  const addAgent = () => {
    if (agents.length >= 6) return;
    setAgents([...agents, createDefaultAgent(agents.length)]);
  };

  const removeAgent = (index: number) => {
    if (agents.length <= 2) return;
    setAgents(agents.filter((_, i) => i !== index));
  };

  const updateAgent = (index: number, agent: AgentConfig) => {
    const updated = [...agents];
    updated[index] = agent;
    setAgents(updated);
  };

  const applyTemplate = (templateId: string) => {
    const template: Template | undefined = TEMPLATES.find((t) => t.id === templateId) || customTemplates.find((t) => t.id === templateId);
    if (!template) return;
    setSelectedTemplate(templateId);
    setMode(template.mode);
    setMaxTurns(template.rules.maxTurns);
    setMaxTokensPerTurn(template.rules.maxTokensPerTurn);
    setLanguage(template.rules.language);
    setAgents(
      template.agents.map((a, i) => ({
        ...a,
        id: uuidv4(),
        color: a.color || AGENT_COLORS[i % AGENT_COLORS.length],
      }))
    );
  };

  const handleSaveTemplate = () => {
    if (!newTemplateName.trim()) return;
    const id = "custom-" + Date.now().toString(36);
    const template = saveCustomTemplate({
      id,
      name: newTemplateName.trim(),
      description: newTemplateDesc.trim() || `Template personnalise avec ${agents.length} agents`,
      mode,
      agents: agents.map(({ id: _id, ...rest }) => rest),
      rules: { maxTurns, maxTokensPerTurn, language },
    });
    setCustomTemplates([template, ...customTemplates.filter((t) => t.id !== id)]);
    setShowSaveTemplate(false);
    setNewTemplateName("");
    setNewTemplateDesc("");
    setSelectedTemplate(id);
  };

  const handleDeleteCustomTemplate = (id: string) => {
    deleteCustomTemplate(id);
    setCustomTemplates((prev) => prev.filter((t) => t.id !== id));
    if (selectedTemplate === id) setSelectedTemplate(null);
  };

  const handleViewSession = (session: SavedSession) => {
    sessionStorage.setItem("ai-arena-config", JSON.stringify(session.config));
    sessionStorage.setItem("ai-arena-result", JSON.stringify(session.result));
    sessionStorage.setItem("ai-arena-start-time", String(new Date(session.date).getTime()));
    router.push("/results");
  };

  const handleReuseSession = (session: SavedSession) => {
    const c = session.config;
    setTopic(c.topic);
    setAdditionalContext(c.additionalContext || "");
    setMode(c.mode);
    setUserMode(c.userMode);
    setMaxTurns(c.rules.maxTurns);
    setMaxTokensPerTurn(c.rules.maxTokensPerTurn);
    setLanguage(c.rules.language);
    setAgents(c.agents.map((a, i) => ({ ...a, id: uuidv4(), color: a.color || AGENT_COLORS[i % AGENT_COLORS.length] })));
    setSelectedTemplate(null);
  };

  const handleDeleteSession = (id: string) => {
    deleteSession(id);
    setHistory((prev) => prev.filter((s) => s.id !== id));
  };

  const expertToAgent = (expert: ExpertProfile, index: number, stance?: string): AgentConfig => ({
    id: uuidv4(),
    name: expert.name,
    provider: "claude",
    model: "claude-haiku-4-5-20251001",
    role: `${expert.title} - ${expert.expertise.slice(0, 80)}`,
    personality: expert.personality,
    stance: (stance as AgentConfig["stance"]) || expert.defaultStance,
    color: AGENT_COLORS[index % AGENT_COLORS.length],
    expertId: expert.id,
    frameworks: expert.frameworks,
    biases: expert.biases,
    style: expert.style,
  });

  const handleSuggestExperts = async () => {
    if (!topic.trim() || !apiKeys.claude?.trim()) return;
    setIsSuggesting(true);
    setSuggestions([]);
    try {
      const res = await fetch("/api/suggest-experts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeys.claude, topic, mode, language }),
      });
      const data = await res.json();
      if (data.experts && data.experts.length > 0) {
        setSuggestions(data.experts);
        // Auto-apply suggestions
        const newAgents = data.experts.map((s: { id: string; suggestedStance?: string }, i: number) => {
          const expert = EXPERT_POOL.find((e) => e.id === s.id);
          if (!expert) return createDefaultAgent(i);
          return expertToAgent(expert, i, s.suggestedStance);
        });
        setAgents(newAgents);
        setSelectedTemplate(null);
        if (data.suggestedMode && data.suggestedMode !== mode) {
          setMode(data.suggestedMode);
        }
      }
    } catch { /* ignore */ }
    setIsSuggesting(false);
  };

  const addExpertFromPool = (expert: ExpertProfile) => {
    if (agents.length >= 6) return;
    setAgents([...agents, expertToAgent(expert, agents.length)]);
    setShowExpertPool(false);
    setSelectedTemplate(null);
  };

  const filteredExperts = expertFilter.trim()
    ? EXPERT_POOL.filter((e) => {
        const q = expertFilter.toLowerCase();
        return e.name.toLowerCase().includes(q) ||
          e.title.toLowerCase().includes(q) ||
          e.domain.includes(q) ||
          e.tags.some((t) => t.includes(q));
      })
    : EXPERT_POOL;

  // At least one provider key + topic + agents named
  const hasRequiredKey = agents.every((a) => {
    if (a.provider === "claude") return !!apiKeys.claude?.trim();
    if (a.provider === "openai") return !!apiKeys.openai?.trim();
    if (a.provider === "gemini") return !!apiKeys.gemini?.trim();
    return false;
  });
  const canStart = topic.trim().length > 0 && hasRequiredKey && agents.every((a) => a.name.trim().length > 0);
  const hasAnyKey = !!(apiKeys.claude?.trim() || apiKeys.openai?.trim() || apiKeys.gemini?.trim());

  const startDiscussion = () => {
    if (!canStart) return;
    const config: SessionConfig = {
      topic,
      additionalContext: additionalContext || undefined,
      mode,
      userMode,
      agents,
      rules: { maxTurns, maxTokensPerTurn, language },
    };
    sessionStorage.setItem("ai-arena-config", JSON.stringify(config));
    sessionStorage.setItem("ai-arena-api-keys", JSON.stringify(apiKeys));
    // Persist keys in localStorage so user doesn't re-enter them
    localStorage.setItem("ai-arena-api-keys", JSON.stringify(apiKeys));
    setIsFirstVisit(false);
    router.push("/discussion");
  };

  const modeLabel: Record<DiscussionMode, string> = {
    exploration: "Exploration",
    decision: "Decision",
    deliverable: "Livrable",
  };

  const usedProviders = new Set(agents.map((a) => a.provider));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent font-mono text-lg font-bold text-white">
              A
            </div>
            <div>
              <h1 className="text-xl font-bold">AI Arena</h1>
              <p className="text-xs text-muted">Discussions Multi-Agents</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Wait for localStorage to load before deciding which view to show */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : isFirstVisit ? (
          <section className="mx-auto max-w-lg">
            <div className="mb-6 text-center">
              <h2 className="mb-2 text-xl font-bold">Bienvenue sur AI Arena</h2>
              <p className="text-sm text-muted">Pour commencer, renseignez au moins une cle API. Vos cles restent stockees localement dans votre navigateur.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div>
                <label className="mb-1 flex items-center gap-2 text-xs font-medium text-muted">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#D97706]" />
                  Anthropic (Claude) <span className="text-accent">recommande</span>
                </label>
                <input
                  type="password"
                  value={apiKeys.claude || ""}
                  onChange={(e) => setApiKeys({ ...apiKeys, claude: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                  placeholder="sk-ant-..."
                  autoFocus
                />
                <p className="mt-1 text-[10px] text-muted">Utilise pour les agents et l&apos;orchestrateur. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent-hover">Obtenir une cle</a></p>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-2 text-xs font-medium text-muted">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#10A37F]" />
                  OpenAI <span className="text-[10px]">(optionnel)</span>
                </label>
                <input
                  type="password"
                  value={apiKeys.openai || ""}
                  onChange={(e) => setApiKeys({ ...apiKeys, openai: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-2 text-xs font-medium text-muted">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#4285F4]" />
                  Google Gemini <span className="text-[10px]">(optionnel)</span>
                </label>
                <input
                  type="password"
                  value={apiKeys.gemini || ""}
                  onChange={(e) => setApiKeys({ ...apiKeys, gemini: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                  placeholder="AIza..."
                />
              </div>
              <button
                onClick={() => {
                  if (hasAnyKey) {
                    localStorage.setItem("ai-arena-api-keys", JSON.stringify(apiKeys));
                    setIsFirstVisit(false);
                    setShowApiKeys(false);
                  }
                }}
                disabled={!hasAnyKey}
                className="w-full rounded-xl bg-accent py-3 text-center font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Commencer
              </button>
            </div>
          </section>
        ) : (<>
        {/* Topic — first and most important */}
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Sujet de la discussion</h2>
          <p className="mb-2 text-xs text-muted">La question, le probleme ou le theme que les agents vont discuter. Plus c&apos;est precis, meilleurs seront les echanges.</p>
          <div className="relative">
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 pr-12 text-sm outline-none focus:border-accent"
              placeholder="Ex: Faut-il migrer notre monolithe vers des microservices ?"
            />
            {micSupported && (
              <button
                type="button"
                onClick={voiceToTopic}
                className={`absolute right-3 top-3 rounded-lg p-2 transition-colors ${
                  isListening ? "bg-danger/10 text-danger animate-pulse" : "text-muted hover:text-accent hover:bg-accent/10"
                }`}
                title={isListening ? "Arreter l'ecoute" : "Dicter le sujet"}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8m-4-12a3 3 0 00-3 3v4a3 3 0 006 0V8a3 3 0 00-3-3z" />
                </svg>
              </button>
            )}
          </div>
          <div className="mt-3">
            <button
              onClick={() => setAdditionalContext(additionalContext ? "" : " ")}
              className="text-xs text-muted hover:text-foreground"
            >
              {additionalContext !== "" ? "- Retirer le contexte" : "+ Ajouter du contexte supplementaire"}
            </button>
            {additionalContext !== "" && (
              <>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  rows={2}
                  className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-accent"
                  placeholder="Ex: Budget max 50k, equipe de 5 devs, deadline Q3 2026..."
                />
                <p className="mt-1 text-[10px] text-muted">Informations supplementaires que tous les agents recevront : contraintes, donnees, documents de reference.</p>
              </>
            )}
          </div>

          {/* Suggest experts button */}
          {topic.trim().length > 5 && apiKeys.claude?.trim() && (
            <div className="mt-4">
              <button
                onClick={handleSuggestExperts}
                disabled={isSuggesting}
                className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
              >
                {isSuggesting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Analyse du sujet en cours...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Suggerer des experts pour ce sujet
                  </>
                )}
              </button>
              <p className="mt-1 text-[10px] text-muted">L&apos;IA analysera votre sujet et proposera les meilleurs experts du pool ({EXPERT_POOL.length} disponibles)</p>
            </div>
          )}

          {/* Suggestion results */}
          {suggestions.length > 0 && (
            <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
              <h3 className="mb-2 text-sm font-semibold text-accent">Experts suggeres</h3>
              <div className="space-y-2">
                {suggestions.map((s) => {
                  const expert = EXPERT_POOL.find((e) => e.id === s.id);
                  if (!expert) return null;
                  return (
                    <div key={s.id} className="flex items-start gap-3 rounded-lg bg-card p-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                        {expert.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{expert.name}</span>
                          <span className="rounded-full bg-border px-1.5 py-0.5 text-[9px] text-muted">{expert.domain}</span>
                          {s.suggestedStance && s.suggestedStance !== "neutre" && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${s.suggestedStance === "pour" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                              {s.suggestedStance}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted">{s.reason}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted">Ces experts ont ete pre-selectionnes. Modifiez-les dans les options avancees ou ajoutez-en depuis le pool.</p>
            </div>
          )}
        </section>

        {/* Templates — compact horizontal pills */}
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Demarrage rapide</h2>
            <button
              onClick={() => setShowSaveTemplate(!showSaveTemplate)}
              className="text-[11px] text-muted transition-colors hover:text-accent"
            >
              + Sauvegarder
            </button>
          </div>
          {showSaveTemplate && (
            <div className="mb-3 flex items-center gap-2">
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                className="w-40 rounded-lg border border-border bg-card px-2 py-1.5 text-xs outline-none focus:border-accent"
                placeholder="Nom du template"
              />
              <input
                type="text"
                value={newTemplateDesc}
                onChange={(e) => setNewTemplateDesc(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs outline-none focus:border-accent"
                placeholder="Description (optionnel)"
              />
              <button
                onClick={handleSaveTemplate}
                disabled={!newTemplateName.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                OK
              </button>
              <button
                onClick={() => setShowSaveTemplate(false)}
                className="text-xs text-muted hover:text-foreground"
              >
                Annuler
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {customTemplates.map((template) => {
              const isSelected = selectedTemplate === template.id;
              return (
                <div key={template.id} className="group relative">
                  <button
                    onClick={() => applyTemplate(template.id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                      isSelected
                        ? "border-accent bg-accent/10 font-semibold text-accent"
                        : "border-border bg-card text-foreground hover:border-accent"
                    }`}
                    title={template.description}
                  >
                    {template.name}
                    <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${
                      template.mode === "decision" ? "bg-amber-500/10 text-amber-500"
                        : template.mode === "deliverable" ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-accent/10 text-accent"
                    }`}>{modeLabel[template.mode]}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteCustomTemplate(template.id)}
                    className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-danger text-[8px] text-white group-hover:flex"
                    title="Supprimer"
                  >&times;</button>
                </div>
              );
            })}
            {TEMPLATES.map((template) => {
              const isSelected = selectedTemplate === template.id;
              return (
                <button
                  key={template.id}
                  onClick={() => applyTemplate(template.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                    isSelected
                      ? "border-accent bg-accent/10 font-semibold text-accent"
                      : "border-border bg-card text-foreground hover:border-accent"
                  }`}
                  title={template.description}
                >
                  {template.name}
                  <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${
                    template.mode === "decision" ? "bg-amber-500/10 text-amber-500"
                      : template.mode === "deliverable" ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-accent/10 text-accent"
                  }`}>{modeLabel[template.mode]}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* API Keys — collapsible, remembers keys */}
        <section className="mb-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <h2 className="text-sm font-semibold">Cles API</h2>
                {!showApiKeys && apiKeys.claude && (
                  <span className="text-[10px] text-muted">Memorisees</span>
                )}
              </div>
              <button onClick={() => setShowApiKeys(!showApiKeys)} className="text-xs text-muted hover:text-foreground">
                {showApiKeys ? "Masquer" : "Modifier"}
              </button>
            </div>
            {showApiKeys && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 flex items-center gap-2 text-xs font-medium text-muted">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#D97706]" />
                    Anthropic (Claude) {usedProviders.has("claude") && <span className="text-accent">*requis</span>}
                  </label>
                  <input
                    type="password"
                    value={apiKeys.claude || ""}
                    onChange={(e) => setApiKeys({ ...apiKeys, claude: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                    placeholder="sk-ant-..."
                  />
                  <p className="mt-1 text-[10px] text-muted">Aussi utilise pour l&apos;orchestrateur IA. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent-hover">Obtenir une cle</a></p>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-2 text-xs font-medium text-muted">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#10A37F]" />
                    OpenAI {usedProviders.has("openai") && <span className="text-accent">*requis</span>}
                  </label>
                  <input
                    type="password"
                    value={apiKeys.openai || ""}
                    onChange={(e) => setApiKeys({ ...apiKeys, openai: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                    placeholder="sk-..."
                  />
                  <p className="mt-1 text-[10px] text-muted">Pour GPT-4o et GPT-4o-mini. <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent-hover">Obtenir une cle</a></p>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-2 text-xs font-medium text-muted">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#4285F4]" />
                    Google (Gemini) {usedProviders.has("gemini") && <span className="text-accent">*requis</span>}
                  </label>
                  <input
                    type="password"
                    value={apiKeys.gemini || ""}
                    onChange={(e) => setApiKeys({ ...apiKeys, gemini: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                    placeholder="AIza..."
                  />
                  <p className="mt-1 text-[10px] text-muted">Pour Gemini Flash et Pro. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent-hover">Obtenir une cle</a></p>
                </div>
                <p className="text-[10px] text-muted">
                  Vos cles restent stockees uniquement dans votre navigateur (localStorage). Elles seront memorisees pour vos prochaines sessions.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Advanced toggle */}
        <div className="mb-6">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            <svg className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Options avancees
            <span className="text-xs text-muted">(parametres, agents, modeles)</span>
          </button>
        </div>

        {showAdvanced && <>
        {/* Discussion settings */}
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Parametres</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as DiscussionMode)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="exploration">Exploration</option>
                <option value="decision">Decision</option>
                <option value="deliverable">Livrable</option>
              </select>
              <p className="mt-1 text-[10px] text-muted">
                {mode === "exploration" && "Discussion ouverte, brainstorming"}
                {mode === "decision" && "Debat contradictoire + vote final"}
                {mode === "deliverable" && "Production iterative d'un document"}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Mode utilisateur</label>
              <select
                value={userMode}
                onChange={(e) => setUserMode(e.target.value as UserMode)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="observer">Observateur</option>
                <option value="interventionist">Interventionniste</option>
                <option value="director">Directeur</option>
              </select>
              <p className="mt-1 text-[10px] text-muted">
                {userMode === "observer" && "Vous regardez sans intervenir"}
                {userMode === "interventionist" && "Vous pouvez envoyer des messages, recadrer ou relancer"}
                {userMode === "director" && "Controle total : pause, synthese, vote anticipe"}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Tours max</label>
              <input
                type="number"
                value={maxTurns}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") { setMaxTurns(0 as unknown as number); return; }
                  setMaxTurns(Number(val));
                }}
                onBlur={() => setMaxTurns(Math.max(3, Math.min(50, maxTurns || 10)))}
                min={3}
                max={50}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <p className="mt-1 text-[10px] text-muted">Nombre max de prises de parole (3-50). L&apos;IA peut conclure plus tot si le sujet converge.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Langue</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="fr">Francais</option>
                <option value="en">English</option>
              </select>
              <p className="mt-1 text-[10px] text-muted">Langue dans laquelle les agents echangent</p>
            </div>
          </div>
        </section>

        {/* Agents */}
        <section className="mb-8">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Participants ({agents.length}/6)</h2>
            <div className="flex gap-2">
              {agents.length < 6 && (
                <>
                  <button
                    onClick={() => setShowExpertPool(!showExpertPool)}
                    className="rounded-lg border border-accent/30 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10"
                  >
                    + Expert du pool
                  </button>
                  <button
                    onClick={addAgent}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    + Agent vide
                  </button>
                </>
              )}
            </div>
          </div>
          <p className="mb-3 text-xs text-muted">Les agents IA qui participeront a la discussion. Minimum 2, maximum 6. Chacun peut utiliser un provider et modele differents.</p>

          {/* Expert pool browser */}
          {showExpertPool && (
            <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-accent">Pool d&apos;experts ({EXPERT_POOL.length})</h3>
                <button onClick={() => setShowExpertPool(false)} className="text-xs text-muted hover:text-foreground">Fermer</button>
              </div>
              <input
                type="text"
                value={expertFilter}
                onChange={(e) => setExpertFilter(e.target.value)}
                className="mb-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
                placeholder="Rechercher par nom, domaine, expertise, tag..."
              />
              <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {filteredExperts.map((expert) => {
                  const alreadyAdded = agents.some((a) => a.expertId === expert.id);
                  return (
                    <button
                      key={expert.id}
                      onClick={() => !alreadyAdded && addExpertFromPool(expert)}
                      disabled={alreadyAdded || agents.length >= 6}
                      className={`rounded-lg border p-3 text-left transition-all ${
                        alreadyAdded
                          ? "border-accent/30 bg-accent/5 opacity-60"
                          : "border-border bg-card hover:border-accent hover:bg-card-hover"
                      } disabled:cursor-not-allowed`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-medium">{expert.name}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                          expert.domain === "tech" ? "bg-blue-500/10 text-blue-500"
                            : expert.domain === "business" ? "bg-amber-500/10 text-amber-500"
                              : expert.domain === "creative" ? "bg-violet-500/10 text-violet-500"
                                : expert.domain === "human" ? "bg-emerald-500/10 text-emerald-500"
                                  : expert.domain === "data" ? "bg-cyan-500/10 text-cyan-500"
                                    : expert.domain === "academic" ? "bg-rose-500/10 text-rose-500"
                                      : "bg-border text-muted"
                        }`}>
                          {expert.domain}
                        </span>
                        {alreadyAdded && <span className="text-[9px] text-accent">ajoute</span>}
                      </div>
                      <p className="text-[10px] text-muted">{expert.title}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {expert.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="rounded bg-border/50 px-1 py-0.5 text-[8px] text-muted">{tag}</span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {agents.map((agent, index) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                index={index}
                onUpdate={(a) => updateAgent(index, a)}
                onRemove={() => removeAgent(index)}
                canRemove={agents.length > 2}
                apiKeys={apiKeys}
                mode={mode}
              />
            ))}
          </div>
        </section>
        </>}

        {/* Start button */}
        <div className="sticky bottom-0 border-t border-border bg-background py-4">
          <button
            onClick={startDiscussion}
            disabled={!canStart}
            className="w-full rounded-xl bg-accent py-3 text-center font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Lancer la discussion
          </button>
          {!hasRequiredKey && (
            <p className="mt-2 text-center text-xs text-danger">
              Veuillez entrer les cles API requises pour les providers utilises.
            </p>
          )}
        </div>

        {/* History — at the bottom */}
        {history.length > 0 && (
          <section className="mb-6 mt-8 border-t border-border pt-8">
            <h2 className="mb-3 text-lg font-semibold">Historique</h2>
            <div className="space-y-2">
              {history.slice(0, 5).map((session) => (
                <div key={session.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-card-hover">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${
                    session.mode === "decision" ? "bg-amber-500" : session.mode === "deliverable" ? "bg-emerald-500" : "bg-accent"
                  }`}>
                    {session.mode === "decision" ? "D" : session.mode === "deliverable" ? "L" : "E"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{session.topic}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      <span>{new Date(session.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <span>·</span>
                      <span>{session.agentNames.join(", ")}</span>
                      <span>·</span>
                      <span>{session.turns} tours</span>
                      <span>·</span>
                      <span className="font-mono">${session.cost.toFixed(4)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => handleViewSession(session)}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
                      title="Voir les resultats"
                    >
                      Resultats
                    </button>
                    <button
                      onClick={() => handleReuseSession(session)}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
                      title="Reutiliser cette configuration"
                    >
                      Reutiliser
                    </button>
                    <button
                      onClick={() => handleDeleteSession(session.id)}
                      className="rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted transition-colors hover:border-danger hover:text-danger"
                      title="Supprimer"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              {history.length > 5 && (
                <p className="text-center text-xs text-muted">et {history.length - 5} autre{history.length - 5 > 1 ? "s" : ""} discussion{history.length - 5 > 1 ? "s" : ""}...</p>
              )}
            </div>
          </section>
        )}

        {/* Feedback History — at the very bottom */}
        {feedbackHistory.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted">Avis ({feedbackHistory.length})</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  <span className="text-amber-400">{"★".repeat(Math.round(feedbackHistory.reduce((s, f) => s + f.rating, 0) / feedbackHistory.length))}</span> {(feedbackHistory.reduce((s, f) => s + f.rating, 0) / feedbackHistory.length).toFixed(1)}/5
                </span>
                <button
                  onClick={() => setShowFeedback(!showFeedback)}
                  className="text-[11px] text-muted transition-colors hover:text-accent"
                >
                  {showFeedback ? "Masquer" : "Details"}
                </button>
              </div>
            </div>
            {showFeedback && (
              <div className="space-y-2">
                {feedbackHistory.map((fb, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400">{"★".repeat(fb.rating)}{"☆".repeat(5 - fb.rating)}</span>
                        <span className="text-xs text-muted">{new Date(fb.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <span className="text-[10px] text-muted">{fb.mode} · {fb.turns} tours</span>
                    </div>
                    <p className="mt-1 truncate text-sm">{fb.topic}</p>
                    {fb.feedback && <p className="mt-1 text-xs text-muted italic">&ldquo;{fb.feedback}&rdquo;</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        </>)}
      </main>
    </div>
  );
}
