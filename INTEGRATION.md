# Integrer AI Arena dans ton projet

Guide pour copier AI Arena dans un autre repository.

---

## Structure du module

```
src/
├── index.ts              # Point d'entree principal (re-exporte tout)
├── lib/                  # Logique metier (zero dependance UI)
│   ├── index.ts          # Barrel export
│   ├── types.ts          # Types TypeScript + constantes (modeles, couts)
│   ├── experts.ts        # 28 profils d'experts pre-configures
│   ├── store.ts          # Hook React pour l'etat de session
│   ├── memories.ts       # Systeme de memoire (localStorage)
│   ├── history.ts        # Historique des sessions (localStorage)
│   ├── templates.ts      # Templates de discussion pre-configures
│   ├── customTemplates.ts# Templates personnalises (localStorage)
│   ├── export.ts         # Export markdown
│   └── api-handlers.ts   # Handlers API standalone (Request/Response)
├── components/           # Composants React (Tailwind CSS)
│   ├── index.ts
│   ├── AgentCard.tsx
│   ├── MessageBubble.tsx
│   └── TypingIndicator.tsx
├── hooks/
│   ├── index.ts
│   └── useSpeechRecognition.ts
└── app/                  # Pages Next.js (optionnel)
    ├── page.tsx           # Page setup
    ├── discussion/page.tsx# Page discussion
    ├── results/page.tsx   # Page resultats
    └── api/               # Routes API Next.js (wrappers des handlers)
        ├── orchestrate/route.ts
        ├── orchestrator/route.ts
        └── suggest-experts/route.ts
```

---

## Etape 1 : Copier les fichiers

```bash
# Depuis la racine du repo AI-Arena, vers ton projet
cp -r src/lib       /chemin/vers/ton-projet/src/ai-arena/lib
cp -r src/components /chemin/vers/ton-projet/src/ai-arena/components
cp -r src/hooks     /chemin/vers/ton-projet/src/ai-arena/hooks
cp    src/index.ts  /chemin/vers/ton-projet/src/ai-arena/index.ts
```

Si tu veux aussi les pages et routes API Next.js :
```bash
cp -r src/app /chemin/vers/ton-projet/src/ai-arena/app
```

---

## Etape 2 : Installer les dependances

```bash
npm install @anthropic-ai/sdk openai uuid
npm install -D @types/uuid
```

Si tu utilises les composants UI, tu as aussi besoin de **Tailwind CSS 4** et des CSS custom properties definies dans `src/app/globals.css`.

---

## Etape 3 : Utiliser

### A) Importer la logique metier seule (sans UI)

```typescript
import {
  // Types
  type SessionConfig,
  type AgentConfig,
  type Message,

  // Experts
  EXPERT_POOL,
  searchExperts,

  // API handlers (fonctionnent avec n'importe quel runtime)
  handleOrchestrate,
  handleOrchestrator,
  handleSuggestExperts,

  // Utilitaires
  estimateCost,
  buildSlidingContext,
  exportToMarkdown,
} from "./ai-arena/lib";
```

### B) Utiliser les API handlers dans tes routes

Les handlers sont des fonctions `(input) => Promise<Response>` standard.
Ils fonctionnent avec Next.js, Express, Hono, Deno, Cloudflare Workers, etc.

**Next.js App Router :**
```typescript
// app/api/orchestrate/route.ts
import { handleOrchestrate } from "@/ai-arena/lib";

export const runtime = "edge";

export async function POST(request: Request) {
  const body = await request.json();
  return handleOrchestrate(body);
}
```

**Express :**
```typescript
import express from "express";
import { handleOrchestrate } from "./ai-arena/lib";

const app = express();
app.use(express.json());

app.post("/api/orchestrate", async (req, res) => {
  const response = await handleOrchestrate(req.body);
  const data = await response.text();
  res.status(response.status).type(response.headers.get("content-type") || "text/plain").send(data);
});
```

**Hono :**
```typescript
import { Hono } from "hono";
import { handleOrchestrate } from "./ai-arena/lib";

const app = new Hono();

app.post("/api/orchestrate", async (c) => {
  const body = await c.req.json();
  return handleOrchestrate(body);
});
```

### C) Utiliser les composants React

```tsx
import { AgentCard, MessageBubble, TypingIndicator } from "./ai-arena/components";
import { useSpeechRecognition } from "./ai-arena/hooks";
```

Les composants utilisent Tailwind CSS avec des classes custom (`text-muted`, `bg-card`, `border-border`, etc.). Tu dois definir ces CSS custom properties dans ton CSS global :

```css
:root {
  --background: #0a0a0f;
  --foreground: #e2e8f0;
  --card: #12121a;
  --border: #1e1e2e;
  --border-hover: #2a2a3e;
  --muted: #64748b;
  --accent: #6366f1;
  --danger: #ef4444;
  --success: #10b981;
}
```

---

## Ce que tu peux utiliser independamment

| Module | Dependance UI | Dependance serveur | Usage |
|--------|--------------|-------------------|-------|
| `lib/types.ts` | Non | Non | Types + constantes partout |
| `lib/experts.ts` | Non | Non | Catalogue de 28 experts |
| `lib/api-handlers.ts` | Non | `@anthropic-ai/sdk`, `openai` | 3 endpoints API complets |
| `lib/store.ts` | React | Non | Gestion d'etat de session |
| `lib/memories.ts` | Non (localStorage) | Non | Memoire persistante |
| `lib/history.ts` | Non (localStorage) | Non | Historique des sessions |
| `lib/templates.ts` | Non | Non | 8 templates pre-configures |
| `lib/export.ts` | Non | Non | Export markdown |
| `components/*` | React + Tailwind | Non | UI discussion |
| `hooks/*` | React | Non | Speech-to-text |

---

## Exemple minimaliste : lancer une discussion en 20 lignes

```typescript
import { handleOrchestrator, handleOrchestrate, EXPERT_POOL } from "./ai-arena/lib";

const agents = [
  { id: "1", name: "CTO", role: "CTO", personality: "Pragmatique" },
  { id: "2", name: "PM", role: "Product Manager", personality: "Centre utilisateur" },
];

// 1. Demander a l'orchestrateur qui parle
const decision = await handleOrchestrator({
  apiKey: "sk-...",
  topic: "Faut-il migrer vers un monorepo ?",
  mode: "decision",
  agents,
  history: [],
  turnNumber: 1,
  maxTurns: 10,
  language: "fr",
});
const { nextSpeaker, instruction } = await decision.json();

// 2. Streamer la reponse de l'agent choisi
const agent = agents.find(a => a.id === nextSpeaker)!;
const stream = await handleOrchestrate({
  provider: "claude",
  apiKey: "sk-...",
  model: "claude-haiku-4-5-20251001",
  systemPrompt: `Tu es ${agent.name}, ${agent.role}. ${agent.personality}.`,
  turnInstruction: instruction,
  history: [],
  topic: "Faut-il migrer vers un monorepo ?",
  maxTokens: 1200,
});

// 3. Lire le stream SSE
const reader = stream.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // Parse SSE events: data: {"type":"content","text":"..."}
  console.log(text);
}
```
