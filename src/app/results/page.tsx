"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SessionConfig, SessionResult } from "@/lib/types";
import { exportToMarkdown, downloadMarkdown } from "@/lib/export";
import MessageBubble from "@/components/MessageBubble";

export default function ResultsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [activeTab, setActiveTab] = useState<"synthesis" | "transcript" | "metrics" | "votes" | "deliverable">("synthesis");

  useEffect(() => {
    const configStr = sessionStorage.getItem("ai-arena-config");
    const resultStr = sessionStorage.getItem("ai-arena-result");
    const startTime = Number(sessionStorage.getItem("ai-arena-start-time") || Date.now());
    if (!configStr || !resultStr) { router.push("/"); return; }
    try {
      const parsedConfig = JSON.parse(configStr);
      const parsedResult = JSON.parse(resultStr);
      parsedResult.metrics.duration = Date.now() - startTime;
      setConfig(parsedConfig);
      setResult(parsedResult);
    } catch { router.push("/"); }
  }, [router]);

  const handleExport = () => {
    if (!config || !result) return;
    const markdown = exportToMarkdown(config, result);
    const filename = `ai-arena-${config.topic.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-")}.md`;
    downloadMarkdown(markdown, filename);
  };

  if (!config || !result) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted">Chargement...</div>
      </div>
    );
  }

  const nonSynthesisMessages = result.messages.filter((m) => !m.isSynthesis && !m.isDeliverable);
  const tokensPerAgent = result.metrics.tokensPerAgent;
  const hasVotes = result.votes && result.votes.length > 0;
  const hasDeliverable = !!result.deliverable;

  const tabs = [
    { id: "synthesis" as const, label: "Synthese" },
    ...(hasDeliverable ? [{ id: "deliverable" as const, label: "Livrable" }] : []),
    ...(hasVotes ? [{ id: "votes" as const, label: "Votes" }] : []),
    { id: "transcript" as const, label: "Transcript" },
    { id: "metrics" as const, label: "Metriques" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")} className="rounded-lg p-1.5 text-muted transition-colors hover:text-foreground">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold">Resultats</h1>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  config.mode === "decision" ? "bg-amber-500/10 text-amber-500"
                    : config.mode === "deliverable" ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-accent/10 text-accent"
                }`}>
                  {config.mode === "decision" ? "Decision" : config.mode === "deliverable" ? "Livrable" : "Exploration"}
                </span>
              </div>
              <p className="max-w-md truncate text-xs text-muted">{config.topic}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.push("/")} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:border-border-hover">
              Nouvelle discussion
            </button>
            <button onClick={handleExport} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
              Exporter Markdown
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg border border-border bg-card p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Synthesis tab */}
        {activeTab === "synthesis" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-6">
              <h2 className="mb-4 text-lg font-semibold text-accent">Synthese de la discussion</h2>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.synthesis}</div>
            </div>

            {result.keyPoints.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="mb-3 font-semibold">Points cles</h3>
                <ul className="space-y-2">
                  {result.keyPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-3 font-semibold">Participants</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {config.agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                    style={{ borderLeftColor: agent.color, borderLeftWidth: 3 }}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: agent.color }}>
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{agent.name}</span>
                        <span className="rounded bg-border px-1 py-0.5 text-[9px] text-muted">{agent.provider}</span>
                      </div>
                      <div className="text-xs text-muted">{agent.role}</div>
                      <div className="text-xs text-muted">{tokensPerAgent[agent.id] || 0} tokens</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Deliverable tab */}
        {activeTab === "deliverable" && hasDeliverable && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
            <h2 className="mb-4 text-lg font-semibold text-emerald-500">Livrable final</h2>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.deliverable}</div>
          </div>
        )}

        {/* Votes tab */}
        {activeTab === "votes" && hasVotes && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Resultats du vote</h2>
            {result.votes!.map((vote) => {
              const agent = config.agents.find((a) => a.id === vote.agentId);
              return (
                <div
                  key={vote.agentId}
                  className="rounded-xl border border-border bg-card p-5"
                  style={{ borderLeftColor: agent?.color || "#888", borderLeftWidth: 4 }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: agent?.color || "#888" }}>
                      {vote.agentName.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold" style={{ color: agent?.color }}>{vote.agentName}</span>
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">VOTE</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{vote.reasoning}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Transcript tab */}
        {activeTab === "transcript" && (
          <div className="rounded-xl border border-border">
            {result.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        )}

        {/* Metrics tab */}
        {activeTab === "metrics" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-5">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="text-xs font-medium text-muted">Tours</div>
                <div className="mt-1 text-2xl font-bold">{result.metrics.totalTurns}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="text-xs font-medium text-muted">Tokens sortie</div>
                <div className="mt-1 text-2xl font-bold">{result.metrics.totalTokens.toLocaleString()}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="text-xs font-medium text-muted">Tokens entree</div>
                <div className="mt-1 text-2xl font-bold">{(result.metrics.totalInputTokens || 0).toLocaleString()}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="text-xs font-medium text-muted">Cout estime</div>
                <div className="mt-1 text-2xl font-bold font-mono">${(result.metrics.estimatedCost || 0).toFixed(4)}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="text-xs font-medium text-muted">Duree</div>
                <div className="mt-1 text-2xl font-bold">{Math.round(result.metrics.duration / 1000)}s</div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 font-semibold">Tokens par agent</h3>
              <div className="space-y-3">
                {config.agents.map((agent) => {
                  const tokens = tokensPerAgent[agent.id] || 0;
                  const maxTokens = Math.max(...Object.values(tokensPerAgent), 1);
                  const percentage = (tokens / maxTokens) * 100;
                  return (
                    <div key={agent.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium" style={{ color: agent.color }}>{agent.name}</span>
                          <span className="rounded bg-border px-1 py-0.5 text-[9px] text-muted">{agent.provider}/{agent.model.split("-").slice(0, 2).join("-")}</span>
                        </div>
                        <span className="text-muted">{tokens} tokens</span>
                      </div>
                      <div className="h-2 rounded-full bg-border">
                        <div className="h-full rounded-full transition-all" style={{ width: `${percentage}%`, backgroundColor: agent.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 font-semibold">Messages par agent</h3>
              <div className="space-y-2">
                {config.agents.map((agent) => {
                  const msgCount = result.messages.filter((m) => m.agentId === agent.id && !m.isVote).length;
                  const voteCount = result.messages.filter((m) => m.agentId === agent.id && m.isVote).length;
                  return (
                    <div key={agent.id} className="flex items-center justify-between text-sm">
                      <span style={{ color: agent.color }}>{agent.name}</span>
                      <span className="text-muted">
                        {msgCount} messages{voteCount > 0 ? ` + ${voteCount} vote` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
