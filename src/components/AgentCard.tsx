"use client";

import { useRef } from "react";
import type { AgentConfig, Provider, ApiKeys, DiscussionMode, Stance, ContextFile } from "@/lib/types";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = (partial: Partial<AgentConfig>) => {
    onUpdate({ ...agent, ...partial });
  };

  const providerAvailable = (p: Provider) => {
    if (p === "claude") return !!apiKeys.claude;
    if (p === "openai") return !!apiKeys.openai;
    if (p === "gemini") return !!apiKeys.gemini;
    return false;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: ContextFile[] = [...(agent.contextFiles || [])];

    Array.from(files).forEach((file) => {
      // Limit to text-based files and reasonable size (100KB)
      if (file.size > 100_000) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        newFiles.push({ name: file.name, content: content.slice(0, 50_000) });
        update({ contextFiles: [...newFiles] });
      };
      reader.readAsText(file);
    });

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    const files = [...(agent.contextFiles || [])];
    files.splice(index, 1);
    update({ contextFiles: files });
  };

  const isExpert = !!agent.expertId;

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
          <div>
            <input
              type="text"
              value={agent.name}
              onChange={(e) => update({ name: e.target.value })}
              className="bg-transparent text-lg font-semibold outline-none focus:underline"
              placeholder="Nom de l'agent"
            />
            {isExpert && (
              <p className="text-[10px] text-accent">Expert du pool</p>
            )}
          </div>
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
          <textarea
            value={agent.personality}
            onChange={(e) => update({ personality: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="Ex: Direct, data-driven, challenge les hypotheses"
          />
          <p className="mt-1 text-[10px] text-muted">Comment il s&apos;exprime : ton, style d&apos;argumentation, traits de caractere.</p>
        </div>

        {/* Expert metadata (read-only display) */}
        {isExpert && agent.frameworks && agent.frameworks.length > 0 && (
          <div className="rounded-lg bg-accent/5 px-3 py-2">
            <p className="mb-1 text-[10px] font-medium text-accent">Frameworks de reference</p>
            <div className="flex flex-wrap gap-1">
              {agent.frameworks.map((f, i) => (
                <span key={i} className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">{f}</span>
              ))}
            </div>
            {agent.biases && (
              <>
                <p className="mt-2 mb-0.5 text-[10px] font-medium text-amber-500">Biais connus</p>
                <p className="text-[10px] text-muted">{agent.biases}</p>
              </>
            )}
            {agent.style && (
              <>
                <p className="mt-2 mb-0.5 text-[10px] font-medium text-emerald-500">Style de communication</p>
                <p className="text-[10px] text-muted">{agent.style}</p>
              </>
            )}
          </div>
        )}

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

        {/* File attachments */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Documents de contexte</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
            >
              + Ajouter un fichier
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".txt,.md,.csv,.json,.yaml,.yml,.xml,.html,.js,.ts,.py,.java,.go,.rs"
              multiple
              onChange={handleFileUpload}
            />
            <span className="text-[10px] text-muted">Texte, Markdown, CSV, JSON... (max 100Ko)</span>
          </div>
          {agent.contextFiles && agent.contextFiles.length > 0 && (
            <div className="mt-2 space-y-1">
              {agent.contextFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-background px-2 py-1">
                  <svg className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="flex-1 truncate text-[11px]">{file.name}</span>
                  <span className="text-[10px] text-muted">{(file.content.length / 1000).toFixed(1)}k</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="rounded p-0.5 text-muted transition-colors hover:text-danger"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
