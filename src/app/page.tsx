"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import type { SessionConfig, AgentConfig, DiscussionMode, UserMode, ApiKeys } from "@/lib/types";
import { AGENT_COLORS } from "@/lib/types";
import { TEMPLATES } from "@/lib/templates";
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
  const [showApiKeys, setShowApiKeys] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentConfig[]>([
    createDefaultAgent(0),
    createDefaultAgent(1),
  ]);

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
    const template = TEMPLATES.find((t) => t.id === templateId);
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

  // At least one provider key + topic + agents named
  const hasRequiredKey = agents.every((a) => {
    if (a.provider === "claude") return !!apiKeys.claude?.trim();
    if (a.provider === "openai") return !!apiKeys.openai?.trim();
    if (a.provider === "gemini") return !!apiKeys.gemini?.trim();
    return false;
  });
  const canStart = topic.trim().length > 0 && hasRequiredKey && agents.every((a) => a.name.trim().length > 0);

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
        {/* API Keys */}
        <section className="mb-8">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <h2 className="font-semibold">Cles API</h2>
              </div>
              <button onClick={() => setShowApiKeys(!showApiKeys)} className="text-xs text-muted hover:text-foreground">
                {showApiKeys ? "Masquer" : "Afficher"}
              </button>
            </div>
            {showApiKeys && (
              <div className="space-y-3">
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
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              Vos cles restent stockees uniquement dans votre navigateur (sessionStorage). Seules les cles des providers utilises sont requises.
            </p>
          </div>
        </section>

        {/* Templates */}
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Templates</h2>
          <p className="mb-3 text-xs text-muted">Configurations pre-definies pour demarrer rapidement. Cliquez pour appliquer : les agents, le mode et les parametres seront pre-remplis.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {TEMPLATES.map((template) => {
              const isSelected = selectedTemplate === template.id;
              return (
              <button
                key={template.id}
                onClick={() => applyTemplate(template.id)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? "border-accent bg-accent/10 ring-1 ring-accent"
                    : "border-border bg-card hover:border-accent hover:bg-card-hover"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  {isSelected && (
                    <svg className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  <span className={`text-sm font-semibold ${isSelected ? "text-accent" : ""}`}>{template.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    template.mode === "decision"
                      ? "bg-amber-500/10 text-amber-500"
                      : template.mode === "deliverable"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-accent/10 text-accent"
                  }`}>
                    {modeLabel[template.mode]}
                  </span>
                </div>
                <div className="text-xs text-muted">{template.description}</div>
              </button>
              );
            })}
          </div>
        </section>

        {/* Topic */}
        <section className="mb-8">
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
        </section>

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
            {agents.length < 6 && (
              <button
                onClick={addAgent}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
              >
                + Ajouter
              </button>
            )}
          </div>
          <p className="mb-3 text-xs text-muted">Les agents IA qui participeront a la discussion. Minimum 2, maximum 6. Chacun peut utiliser un provider et modele differents.</p>
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
      </main>
    </div>
  );
}
