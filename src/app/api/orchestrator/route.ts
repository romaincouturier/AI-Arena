import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";
export const maxDuration = 30;

interface RequestBody {
  apiKey: string;
  topic: string;
  mode: "exploration" | "decision" | "deliverable";
  agents: { id: string; name: string; role: string; personality: string; stance?: string }[];
  history: { agentName: string; content: string; isUser?: boolean }[];
  turnNumber: number;
  maxTurns: number;
  language: string;
}

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { apiKey, topic, mode, agents, history, turnNumber, maxTurns, language } = body;

  if (!apiKey) {
    return new Response("Missing API key", { status: 400 });
  }

  const agentsList = agents.map((a) => `- ${a.name} (${a.role}${a.stance ? `, position: ${a.stance}` : ""})`).join("\n");

  const modeInstructions = {
    exploration: `Mode EXPLORATION : discussion ouverte. Fais circuler la parole pour maximiser la diversite des perspectives. Detecte quand la discussion tourne en rond.`,
    decision: `Mode DECISION : debat contradictoire pour trancher. Assure-toi que chaque camp a presente ses arguments. Quand les positions sont claires et que les arguments n'evoluent plus, passe a "ready_to_conclude" pour declencher le vote.`,
    deliverable: `Mode LIVRABLE : production d'un document iteratif. Oriente la discussion vers la construction progressive d'un livrable. Quand le livrable semble suffisamment mur, passe a "ready_to_conclude".`,
  };

  const systemPrompt = `Tu es l'orchestrateur d'une discussion multi-agents. Tu dois analyser l'historique et decider qui parle ensuite et quelle instruction lui donner.

Sujet : ${topic}
Mode : ${mode}
${modeInstructions[mode]}

Participants :
${agentsList}

Tour actuel : ${turnNumber}/${maxTurns}
Langue : ${language === "fr" ? "francais" : "anglais"}

Regles :
1. DISTRIBUER LA PAROLE intelligemment (pas round-robin) en fonction de la pertinence et de l'equilibre
2. CADRER LES ECHANGES avec une micro-instruction specifique pour le prochain agent
3. DETECTER L'ETAT de la discussion (active, converging, stalling, ready_to_conclude)
4. IDENTIFIER LES POINTS CLES au fur et a mesure

Tu DOIS repondre UNIQUEMENT avec un JSON valide (pas de markdown, pas de texte autour) :
{
  "nextSpeaker": "id_de_l_agent",
  "instruction": "instruction specifique pour l'agent",
  "discussionState": "active|converging|stalling|ready_to_conclude",
  "keyPointsSoFar": ["point 1", "point 2"]
}`;

  const historyText = history.length > 0
    ? history.map((m) => `[${m.isUser ? "Utilisateur" : m.agentName}]: ${m.content}`).join("\n\n")
    : "(Debut de la discussion, aucun message encore)";

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: `Historique de la discussion :\n\n${historyText}\n\nQui parle ensuite et quelle instruction ?` }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response
    let parsed;
    try {
      // Try direct parse
      parsed = JSON.parse(text);
    } catch {
      // Try to extract JSON from text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: round-robin
        const agentIndex = (turnNumber - 1) % agents.length;
        parsed = {
          nextSpeaker: agents[agentIndex].id,
          instruction: "Continue la discussion en apportant ton point de vue.",
          discussionState: turnNumber >= maxTurns * 0.9 ? "ready_to_conclude" : "active",
          keyPointsSoFar: [],
        };
      }
    }

    // Validate nextSpeaker exists
    const validAgent = agents.find((a) => a.id === parsed.nextSpeaker);
    if (!validAgent) {
      // Fallback if agent not found
      const agentIndex = (turnNumber - 1) % agents.length;
      parsed.nextSpeaker = agents[agentIndex].id;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Fallback on error
    const agentIndex = (turnNumber - 1) % agents.length;
    return new Response(JSON.stringify({
      nextSpeaker: agents[agentIndex].id,
      instruction: "Continue la discussion.",
      discussionState: "active",
      keyPointsSoFar: [],
      error: err instanceof Error ? err.message : "Orchestrator error",
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
