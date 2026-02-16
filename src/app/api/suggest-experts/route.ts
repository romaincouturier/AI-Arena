import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { EXPERT_POOL } from "../../../lib/experts";

export const runtime = "edge";
export const maxDuration = 15;

interface RequestBody {
  apiKey: string;
  provider?: "claude" | "openai" | "gemini";
  topic: string;
  mode: "exploration" | "decision" | "deliverable";
  language: string;
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { apiKey, provider = "claude", topic, mode, language } = body;
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

    // Validate expert IDs exist
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
