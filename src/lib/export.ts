import type { SessionConfig, SessionResult } from "./types";

export function exportToMarkdown(config: SessionConfig, result: SessionResult): string {
  const lines: string[] = [];

  lines.push(`# AI Arena - Transcript de discussion`);
  lines.push("");
  lines.push(`> **AI Arena** est une arene de discussion multi-agents ou des IA de differents fournisseurs (Claude, GPT, Gemini) debattent, collaborent et produisent des livrables sur n'importe quel sujet — le tout orchestre en temps reel par une IA dediee. Chaque agent incarne un expert avec sa personnalite, ses frameworks de reference et ses biais, pour des discussions riches et complementaires.`);
  lines.push("");
  lines.push(`## Sujet`);
  lines.push("");
  lines.push(config.topic);
  lines.push("");

  if (config.additionalContext) {
    lines.push(`## Contexte additionnel`);
    lines.push("");
    lines.push(config.additionalContext);
    lines.push("");
  }

  lines.push(`## Configuration`);
  lines.push("");
  lines.push(`- **Mode** : ${config.mode}`);
  lines.push(`- **Langue** : ${config.rules.language}`);
  lines.push(`- **Tours max** : ${config.rules.maxTurns}`);
  lines.push("");

  lines.push(`### Participants`);
  lines.push("");
  for (const agent of config.agents) {
    lines.push(`- **${agent.name}** (${agent.provider}/${agent.model})`);
    lines.push(`  - Role : ${agent.role}`);
    lines.push(`  - Personnalite : ${agent.personality}`);
    if (agent.stance) lines.push(`  - Position : ${agent.stance}`);
  }
  lines.push("");
  lines.push(`---`);
  lines.push("");

  // Discussion
  lines.push(`## Discussion`);
  lines.push("");

  for (const message of result.messages) {
    if (message.isSynthesis) {
      lines.push(`### Synthese`);
      lines.push("");
      lines.push(message.content);
      lines.push("");
    } else if (message.isDeliverable) {
      lines.push(`### Livrable final`);
      lines.push("");
      lines.push(message.content);
      lines.push("");
    } else if (message.isVote) {
      lines.push(`### ${message.agentName} — VOTE`);
      lines.push("");
      lines.push(message.content);
      lines.push("");
    } else if (message.isUser) {
      lines.push(`### [Utilisateur] (Tour ${message.turnNumber})`);
      lines.push("");
      lines.push(message.content);
      lines.push("");
    } else {
      const providerTag = message.provider ? ` [${message.provider}]` : "";
      lines.push(`### ${message.agentName}${providerTag} (Tour ${message.turnNumber})`);
      lines.push("");
      lines.push(message.content);
      lines.push("");
    }
  }

  lines.push(`---`);
  lines.push("");

  // Deliverable section
  if (result.deliverable) {
    lines.push(`## Livrable`);
    lines.push("");
    lines.push(result.deliverable);
    lines.push("");
  }

  // Votes section
  if (result.votes && result.votes.length > 0) {
    lines.push(`## Resultats du vote`);
    lines.push("");
    for (const vote of result.votes) {
      lines.push(`### ${vote.agentName}`);
      lines.push("");
      lines.push(vote.reasoning);
      lines.push("");
    }
  }

  // Synthesis section
  lines.push(`## Synthese`);
  lines.push("");
  lines.push(result.synthesis);
  lines.push("");

  if (result.keyPoints.length > 0) {
    lines.push(`## Points cles`);
    lines.push("");
    for (const point of result.keyPoints) {
      lines.push(`- ${point}`);
    }
    lines.push("");
  }

  lines.push(`## Metriques`);
  lines.push("");
  lines.push(`- **Tours total** : ${result.metrics.totalTurns}`);
  lines.push(`- **Tokens sortie** : ${result.metrics.totalTokens}`);
  lines.push(`- **Tokens entree** : ${result.metrics.totalInputTokens || 0}`);
  lines.push(`- **Cout estime** : $${(result.metrics.estimatedCost || 0).toFixed(4)}`);
  lines.push(`- **Duree** : ${Math.round(result.metrics.duration / 1000)}s`);
  lines.push("");

  lines.push(`### Tokens par agent`);
  lines.push("");
  for (const [agentId, tokens] of Object.entries(result.metrics.tokensPerAgent)) {
    const agent = config.agents.find((a) => a.id === agentId);
    lines.push(`- **${agent?.name || agentId}** (${agent?.provider || "?"}): ${tokens} tokens`);
  }
  lines.push("");
  lines.push(`---`);
  lines.push(`*Genere par AI Arena*`);

  return lines.join("\n");
}

export function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
