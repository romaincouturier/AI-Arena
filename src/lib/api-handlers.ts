/**
 * AI Arena — Standalone API handlers
 *
 * These are pure Web API functions (Request → Response) that work with
 * any runtime supporting the Fetch API (Next.js, Deno, Cloudflare Workers, Bun, etc.)
 *
 * Dependencies: @anthropic-ai/sdk, openai
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { EXPERT_POOL } from "./experts";

// ════════════════════════════════════════════════════════════════
// Shared SSE helpers
// ════════════════════════════════════════════════════════════════

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
}

function sseEncode(encoder: TextEncoder, data: string): Uint8Array {
  return encoder.encode(`data: ${data}\n\n`);
}

// ════════════════════════════════════════════════════════════════
// 1. orchestrate — Stream agent responses (Claude / OpenAI / Gemini)
// ════════════════════════════════════════════════════════════════

export interface OrchestrateInput {
  provider: "claude" | "openai" | "gemini";
  apiKey: string;
  model: string;
  systemPrompt: string;
  turnInstruction: string;
  history: { agentName: string; content: string; isUser?: boolean }[];
  topic: string;
  maxTokens: number;
}

/**
 * Stream an agent response via SSE.
 * Returns a standard `Response` with `text/event-stream` content-type.
 *
 * Events sent:
 *  - `{ type: "content", text: "..." }` — streamed text chunk
 *  - `{ type: "usage", inputTokens: N, outputTokens: N }` — final usage
 *  - `[DONE]` — stream complete
 *  - `{ type: "error", message: "..." }` — on failure
 */
export async function handleOrchestrate(input: OrchestrateInput): Promise<Response> {
  const { provider = "claude", apiKey, model, systemPrompt, turnInstruction, history, topic, maxTokens } = input;

  if (!apiKey || !model || !systemPrompt) {
    return new Response("Missing required fields (apiKey, model, systemPrompt)", { status: 400 });
  }

  let userContent: string;
  if (history && history.length > 0) {
    const historyText = history
      .map((m) => `[${m.isUser ? "Utilisateur" : m.agentName}]: ${m.content}`)
      .join("\n\n");
    userContent = `Voici l'historique de la discussion jusqu'ici :\n\n${historyText}\n\n---\n\nInstruction pour ce tour : ${turnInstruction}`;
  } else {
    userContent = `Sujet de discussion : ${topic}\n\nInstruction : ${turnInstruction}`;
  }

  try {
    if (provider === "openai") {
      return await streamOpenAI(apiKey, model, systemPrompt, userContent, maxTokens);
    } else if (provider === "gemini") {
      return await streamGemini(apiKey, model, systemPrompt, userContent, maxTokens);
    } else {
      return await streamClaude(apiKey, model, systemPrompt, userContent, maxTokens);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function streamClaude(apiKey: string, model: string, systemPrompt: string, userContent: string, maxTokens: number) {
  const client = new Anthropic({ apiKey });
  const stream = await client.messages.stream({
    model,
    max_tokens: maxTokens || 1200,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta") {
            const delta = event.delta;
            if ("text" in delta) {
              controller.enqueue(sseEncode(encoder, JSON.stringify({ type: "content", text: delta.text })));
            }
          }
        }
        const final = await stream.finalMessage();
        controller.enqueue(sseEncode(encoder, JSON.stringify({
          type: "usage",
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
        })));
        controller.enqueue(sseEncode(encoder, "[DONE]"));
        controller.close();
      } catch (err) {
        controller.enqueue(sseEncode(encoder, JSON.stringify({
          type: "error", message: err instanceof Error ? err.message : "Claude error",
        })));
        controller.close();
      }
    },
  });
  return new Response(readableStream, { headers: sseHeaders() });
}

async function streamOpenAI(apiKey: string, model: string, systemPrompt: string, userContent: string, maxTokens: number) {
  const client = new OpenAI({ apiKey });
  const stream = await client.chat.completions.create({
    model,
    max_tokens: maxTokens || 1200,
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        let inputTokens = 0;
        let outputTokens = 0;
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            controller.enqueue(sseEncode(encoder, JSON.stringify({ type: "content", text: delta.content })));
          }
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens || 0;
            outputTokens = chunk.usage.completion_tokens || 0;
          }
        }
        controller.enqueue(sseEncode(encoder, JSON.stringify({
          type: "usage", inputTokens, outputTokens,
        })));
        controller.enqueue(sseEncode(encoder, "[DONE]"));
        controller.close();
      } catch (err) {
        controller.enqueue(sseEncode(encoder, JSON.stringify({
          type: "error", message: err instanceof Error ? err.message : "OpenAI error",
        })));
        controller.close();
      }
    },
  });
  return new Response(readableStream, { headers: sseHeaders() });
}

async function streamGemini(apiKey: string, model: string, systemPrompt: string, userContent: string, maxTokens: number) {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  });
  const stream = await client.chat.completions.create({
    model,
    max_tokens: maxTokens || 1200,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  const encoder = new TextEncoder();
  let totalChars = 0;
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            totalChars += delta.content.length;
            controller.enqueue(sseEncode(encoder, JSON.stringify({ type: "content", text: delta.content })));
          }
        }
        const estimatedOutputTokens = Math.ceil(totalChars / 4);
        controller.enqueue(sseEncode(encoder, JSON.stringify({
          type: "usage",
          inputTokens: 0,
          outputTokens: estimatedOutputTokens,
        })));
        controller.enqueue(sseEncode(encoder, "[DONE]"));
        controller.close();
      } catch (err) {
        controller.enqueue(sseEncode(encoder, JSON.stringify({
          type: "error", message: err instanceof Error ? err.message : "Gemini error",
        })));
        controller.close();
      }
    },
  });
  return new Response(readableStream, { headers: sseHeaders() });
}

// ════════════════════════════════════════════════════════════════
// 2. orchestrator — Decide who speaks next (non-streaming)
// ════════════════════════════════════════════════════════════════

export interface OrchestratorInput {
  apiKey: string;
  provider?: "claude" | "openai" | "gemini";
  topic: string;
  mode: "exploration" | "decision" | "deliverable";
  agents: { id: string; name: string; role: string; personality: string; stance?: string }[];
  history: { agentName: string; content: string; isUser?: boolean }[];
  turnNumber: number;
  maxTurns: number;
  language: string;
}

export interface OrchestratorOutput {
  nextSpeaker: string;
  instruction: string;
  discussionState: "active" | "converging" | "stalling" | "ready_to_conclude";
  keyPointsSoFar: string[];
  error?: string;
}

/**
 * Decide which agent speaks next and what instruction to give.
 * Returns a JSON `Response`.
 */
export async function handleOrchestrator(input: OrchestratorInput): Promise<Response> {
  const { apiKey, provider = "claude", topic, mode, agents, history, turnNumber, maxTurns, language } = input;

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

SUJET CENTRAL (ne jamais perdre de vue) : ${topic}
Mode : ${mode}
${modeInstructions[mode]}

Participants :
${agentsList}

Tour actuel : ${turnNumber}/${maxTurns}
Langue : ${language === "fr" ? "francais" : "anglais"}

Regles CRITIQUES :
1. DISTRIBUER LA PAROLE intelligemment (pas round-robin) en fonction de la pertinence et de l'equilibre
2. CADRER LES ECHANGES avec une micro-instruction specifique pour le prochain agent — cette instruction DOIT :
   a) Rappeler le lien avec le SUJET CENTRAL si la discussion derive
   b) Demander a l'agent de REAGIR aux points specifiques des interventions precedentes (citer les noms)
   c) Demander a l'agent de CONCLURE son point, pas de lister indefiniment — mieux vaut un argument complet que trois inacheves
3. DETECTER L'ETAT de la discussion (active, converging, stalling, ready_to_conclude)
4. IDENTIFIER LES POINTS CLES au fur et a mesure
5. Si la discussion DERIVE trop loin du sujet central, demander explicitement a l'agent de RECENTRER sur la question de depart
6. ALTERNER entre les agents qui n'ont pas encore parle avant de redonner la parole a un agent qui a deja parle recemment

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

  const userContent = `Historique de la discussion :\n\n${historyText}\n\nQui parle ensuite et quelle instruction ?`;

  try {
    let text = "";

    if (provider === "openai") {
      const client = new OpenAI({ apiKey });
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 500,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      });
      text = response.choices[0]?.message?.content || "";
    } else if (provider === "gemini") {
      const client = new OpenAI({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });
      const response = await client.chat.completions.create({
        model: "gemini-2.0-flash",
        max_tokens: 500,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      });
      text = response.choices[0]?.message?.content || "";
    } else {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      });
      text = response.content[0].type === "text" ? response.content[0].text : "";
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        const agentIndex = (turnNumber - 1) % agents.length;
        parsed = {
          nextSpeaker: agents[agentIndex].id,
          instruction: "Continue la discussion en apportant ton point de vue.",
          discussionState: turnNumber >= maxTurns * 0.9 ? "ready_to_conclude" : "active",
          keyPointsSoFar: [],
        };
      }
    }

    const validAgent = agents.find((a) => a.id === parsed.nextSpeaker);
    if (!validAgent) {
      const agentIndex = (turnNumber - 1) % agents.length;
      parsed.nextSpeaker = agents[agentIndex].id;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
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

// ════════════════════════════════════════════════════════════════
// 3. suggest-experts — AI-powered expert selection
// ════════════════════════════════════════════════════════════════

export interface SuggestExpertsInput {
  apiKey: string;
  provider?: "claude" | "openai" | "gemini";
  topic: string;
  mode: "exploration" | "decision" | "deliverable";
  language: string;
}

export interface SuggestedExpert {
  id: string;
  reason: string;
  suggestedStance: "pour" | "contre" | "neutre";
}

/**
 * Suggest the best experts from the pool for a given topic.
 * Returns a JSON `Response`.
 */
export async function handleSuggestExperts(input: SuggestExpertsInput): Promise<Response> {
  const { apiKey, provider = "claude", topic, mode, language } = input;

  if (!apiKey || !topic) {
    return new Response("Missing apiKey or topic", { status: 400 });
  }

  const expertCatalog = EXPERT_POOL.map((e) =>
    `- id:${e.id} | ${e.name} (${e.title}) | domaine:${e.domain} | expertise: ${e.expertise.slice(0, 120)} | tags: ${e.tags.join(", ")}`
  ).join("\n");

  const modeDesc = {
    exploration: "discussion ouverte et exploratoire (brainstorm, decouverte)",
    decision: "debat contradictoire pour prendre une decision (vote final)",
    deliverable: "production collaborative d'un livrable concret (document, spec, plan)",
  };

  const prompt = `Tu es un expert en composition d'equipes de discussion. Ton role : choisir les 3 a 4 experts les plus pertinents pour discuter de ce sujet.

SUJET : ${topic}
MODE : ${modeDesc[mode]}
LANGUE : ${language === "fr" ? "francais" : "anglais"}

CATALOGUE D'EXPERTS DISPONIBLES :
${expertCatalog}

REGLES :
1. Choisis 3 a 4 experts (pas plus) qui apportent des perspectives COMPLEMENTAIRES et non redondantes
2. En mode decision, inclus au moins un expert qui sera naturellement "pour" et un "contre"
3. En mode deliverable, inclus les competences necessaires pour produire le livrable
4. Explique en 1 phrase pourquoi chaque expert est pertinent pour CE sujet
5. Suggere aussi le mode de discussion optimal si different de celui demande

Tu DOIS repondre UNIQUEMENT avec un JSON valide :
{
  "experts": [
    { "id": "expert_id", "reason": "pourquoi cet expert est pertinent", "suggestedStance": "pour|contre|neutre" }
  ],
  "suggestedMode": "exploration|decision|deliverable",
  "modeReason": "pourquoi ce mode (optionnel, seulement si different du mode demande)"
}`;

  try {
    let text = "";

    if (provider === "openai") {
      const client = new OpenAI({ apiKey });
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });
      text = response.choices[0]?.message?.content || "";
    } else if (provider === "gemini") {
      const client = new OpenAI({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });
      const response = await client.chat.completions.create({
        model: "gemini-2.0-flash",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });
      text = response.choices[0]?.message?.content || "";
    } else {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });
      text = response.content[0].type === "text" ? response.content[0].text : "";
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = {
          experts: EXPERT_POOL.slice(0, 3).map((e) => ({
            id: e.id,
            reason: "Suggestion par defaut",
            suggestedStance: "neutre",
          })),
          suggestedMode: mode,
        };
      }
    }

    const validIds = new Set(EXPERT_POOL.map((e) => e.id));
    parsed.experts = (parsed.experts || []).filter(
      (e: { id: string }) => validIds.has(e.id)
    );

    if (parsed.experts.length === 0) {
      parsed.experts = EXPERT_POOL.slice(0, 3).map((e) => ({
        id: e.id,
        reason: "Suggestion par defaut",
        suggestedStance: "neutre",
      }));
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Suggest error",
      experts: EXPERT_POOL.slice(0, 3).map((e) => ({
        id: e.id,
        reason: "Suggestion par defaut (erreur API)",
        suggestedStance: "neutre" as const,
      })),
      suggestedMode: mode,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
