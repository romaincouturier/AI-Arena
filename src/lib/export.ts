import type { Message, SessionConfig, SessionResult } from "./types";

export function exportToMarkdown(
  config: SessionConfig,
  result: SessionResult
): string {
  const lines: string[] = [];

  lines.push(`# AI Arena - Transcript de discussion`);
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
    if (agent.stance) {
      lines.push(`  - Position : ${agent.stance}`);
    }
  }
  lines.push("");

  lines.push(`---`);
  lines.push("");
  lines.push(`## Discussion`);
  lines.push("");

  for (const message of result.messages) {
    if (message.isSynthesis) {
      lines.push(`### Synthese finale`);
      lines.push("");
      lines.push(message.content);
      lines.push("");
    } else if (message.isUser) {
      lines.push(`### [Utilisateur] (Tour ${message.turnNumber})`);
      lines.push("");
      lines.push(message.content);
      lines.push("");
    } else {
      lines.push(`### ${message.agentName} (Tour ${message.turnNumber})`);
      lines.push("");
      lines.push(message.content);
      lines.push("");
    }
  }

  lines.push(`---`);
  lines.push("");
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
  lines.push(`- **Tokens total** : ${result.metrics.totalTokens}`);
  lines.push(`- **Duree** : ${Math.round(result.metrics.duration / 1000)}s`);
  lines.push("");

  lines.push(`### Tokens par agent`);
  lines.push("");
  for (const [agentId, tokens] of Object.entries(result.metrics.tokensPerAgent)) {
    const agent = config.agents.find((a) => a.id === agentId);
    lines.push(`- **${agent?.name || agentId}** : ${tokens} tokens`);
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
