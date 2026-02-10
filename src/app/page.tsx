"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import type { SessionConfig, AgentConfig, DiscussionMode, UserMode } from "@/lib/types";
import { AGENT_COLORS } from "@/lib/types";
import { TEMPLATES } from "@/lib/templates";
import AgentCard from "@/components/AgentCard";
import { createDefaultAgent } from "@/lib/store";

export default function SetupPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [mode, setMode] = useState<DiscussionMode>("exploration");
  const [userMode, setUserMode] = useState<UserMode>("observer");
  const [maxTurns, setMaxTurns] = useState(10);
  const [maxTokensPerTurn, setMaxTokensPerTurn] = useState(500);
  const [language, setLanguage] = useState("fr");
  const [apiKey, setApiKey] = useState("");
  const [agents, setAgents] = useState<AgentConfig[]>([
    createDefaultAgent(0),
    createDefaultAgent(1),
  ]);
  const [showApiKeyInput, setShowApiKeyInput] = useState(true);

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

  const canStart = topic.trim().length > 0 && apiKey.trim().length > 0 && agents.every((a) => a.name.trim().length > 0);

  const startDiscussion = () => {
    if (!canStart) return;

    const config: SessionConfig = {
      topic,
      additionalContext: additionalContext || undefined,
      mode,
      userMode,
      agents,
      rules: {
        maxTurns,
        maxTokensPerTurn,
        language,
      },
    };

    sessionStorage.setItem("ai-arena-config", JSON.stringify(config));
    sessionStorage.setItem("ai-arena-api-key", apiKey);
    router.push("/discussion");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
        {/* API Key */}
        <section className="mb-8">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <h2 className="font-semibold">Cle API Anthropic</h2>
              </div>
              <button
                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                className="text-xs text-muted hover:text-foreground"
              >
                {showApiKeyInput ? "Masquer" : "Afficher"}
              </button>
            </div>
            {showApiKeyInput && (
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                placeholder="sk-ant-..."
              />
            )}
            <p className="mt-2 text-xs text-muted">
              Votre cle reste stockee uniquement dans votre navigateur (sessionStorage).
            </p>
          </div>
        </section>

        {/* Templates */}
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Templates</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => applyTemplate(template.id)}
                className="rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-accent hover:bg-card-hover"
              >
                <div className="mb-1 text-sm font-semibold">{template.name}</div>
                <div className="text-xs text-muted">{template.description}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Topic */}
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Sujet de la discussion</h2>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-accent"
            placeholder="Decrivez le sujet, la question ou le probleme a debattre..."
          />
          <div className="mt-3">
            <button
              onClick={() =>
                setAdditionalContext(additionalContext ? "" : " ")
              }
              className="text-xs text-muted hover:text-foreground"
            >
              {additionalContext !== ""
                ? "- Retirer le contexte"
                : "+ Ajouter du contexte supplementaire"}
            </button>
            {additionalContext !== "" && (
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                rows={2}
                className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-accent"
                placeholder="Documents, contraintes, donnees de cadrage..."
              />
            )}
          </div>
        </section>

        {/* Discussion settings */}
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Parametres</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as DiscussionMode)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="exploration">Exploration</option>
                <option value="decision" disabled>
                  Decision (V2)
                </option>
                <option value="deliverable" disabled>
                  Livrable (V2)
                </option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Mode utilisateur
              </label>
              <select
                value={userMode}
                onChange={(e) => setUserMode(e.target.value as UserMode)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="observer">Observateur</option>
                <option value="interventionist">Interventionniste</option>
                <option value="director">Directeur</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Tours max
              </label>
              <input
                type="number"
                value={maxTurns}
                onChange={(e) =>
                  setMaxTurns(Math.max(3, Math.min(50, Number(e.target.value))))
                }
                min={3}
                max={50}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Langue
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="fr">Francais</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </section>

        {/* Agents */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Participants ({agents.length}/6)
            </h2>
            {agents.length < 6 && (
              <button
                onClick={addAgent}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
              >
                + Ajouter
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {agents.map((agent, index) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                index={index}
                onUpdate={(a) => updateAgent(index, a)}
                onRemove={() => removeAgent(index)}
                canRemove={agents.length > 2}
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
          {!apiKey.trim() && (
            <p className="mt-2 text-center text-xs text-danger">
              Veuillez entrer votre cle API Anthropic pour commencer.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
