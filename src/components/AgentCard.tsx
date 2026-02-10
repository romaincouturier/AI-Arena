"use client";

import type { AgentConfig, Provider, ApiKeys, DiscussionMode, Stance } from "@/lib/types";
import { AVAILABLE_MODELS } from "@/lib/types";

interface AgentCardProps {
  agent: AgentConfig;
  index: number;
  onUpdate: (agent: AgentConfig) => void;
  onRemove: () => void;
  canRemove: boolean;
  apiKeys: ApiKeys;
  mode: DiscussionMode;
}

export default function AgentCard({
  agent,
  index,
  onUpdate,
  onRemove,
  canRemove,
  apiKeys,
  mode,
}: AgentCardProps) {
  const update = (partial: Partial<AgentConfig>) => {
    onUpdate({ ...agent, ...partial });
  };

  const providerAvailable = (p: Provider) => {
    if (p === "claude") return !!apiKeys.claude;
    if (p === "openai") return !!apiKeys.openai;
    if (p === "gemini") return !!apiKeys.gemini;
    return false;
  };

  return (
    <div
      className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-border-hover"
      style={{ borderLeftColor: agent.color, borderLeftWidth: 4 }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: agent.color }}
          >
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <input
            type="text"
            value={agent.name}
            onChange={(e) => update({ name: e.target.value })}
            className="bg-transparent text-lg font-semibold outline-none focus:underline"
            placeholder="Nom de l'agent"
          />
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            title="Supprimer cet agent"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Provider</label>
            <select
              value={agent.provider}
              onChange={(e) => {
                const provider = e.target.value as Provider;
                const models = AVAILABLE_MODELS[provider];
                update({ provider, model: models[0].id });
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="claude">Claude (Anthropic)</option>
              <option value="openai" disabled={!providerAvailable("openai")}>
                OpenAI {!apiKeys.openai && "(cle requise)"}
              </option>
              <option value="gemini" disabled={!providerAvailable("gemini")}>
                Gemini {!apiKeys.gemini && "(cle requise)"}
              </option>
            </select>
            <p className="mt-1 text-[10px] text-muted">Service IA qui alimente cet agent. Chaque provider a sa cle API.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Modele</label>
            <select
              value={agent.model}
              onChange={(e) => update({ model: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {AVAILABLE_MODELS[agent.provider].map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted">Modele plus puissant = meilleur mais plus cher. Mini/Flash pour les roles simples.</p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Role</label>
          <input
            type="text"
            value={agent.role}
            onChange={(e) => update({ role: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="Ex: Expert produit B2B SaaS"
          />
          <p className="mt-1 text-[10px] text-muted">L&apos;expertise ou la fonction de cet agent dans la discussion.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Personnalite</label>
          <input
            type="text"
            value={agent.personality}
            onChange={(e) => update({ personality: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="Ex: Direct, data-driven, challenge les hypotheses"
          />
          <p className="mt-1 text-[10px] text-muted">Comment il s&apos;exprime : ton, style d&apos;argumentation, traits de caractere.</p>
        </div>

        {mode === "decision" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Position</label>
            <select
              value={agent.stance || "neutre"}
              onChange={(e) => update({ stance: e.target.value as Stance })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="pour">Pour</option>
              <option value="contre">Contre</option>
              <option value="neutre">Neutre</option>
            </select>
            <p className="mt-1 text-[10px] text-muted">En mode Decision : l&apos;agent defendera, attaquera ou analysera la position.</p>
          </div>
        )}
      </div>
    </div>
  );
}
