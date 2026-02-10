# AI Arena

Plateforme web permettant d'orchestrer des discussions entre plusieurs agents IA (Claude) sur un sujet donne. Configurez les participants, leur role, leur personnalite, puis lancez le debat et observez en temps reel.

## Fonctionnalites (MVP)

- Configuration de 2 a 6 agents IA (Claude, Anthropic)
- Saisie du sujet et contexte additionnel
- Mode Exploration (discussion libre, N tours)
- Streaming en temps reel des reponses
- Synthese finale auto-generee
- Export Markdown du transcript complet
- Templates pre-configures (Debat, Comite de direction, Brainstorm, Revue technique)
- 3 modes utilisateur : Observateur, Interventionniste, Directeur

## Stack technique

- **Frontend** : Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Backend** : Next.js API Routes (Edge Runtime)
- **IA** : Anthropic Claude API (streaming SSE)
- **Deploiement** : Vercel

## Demarrage

```bash
npm install
npm run dev
```

Ouvrir http://localhost:3000 et entrer votre cle API Anthropic pour commencer.

## Deploiement Vercel

Le projet est pret a etre deploye sur Vercel. Aucune variable d'environnement n'est requise cote serveur — la cle API est fournie par l'utilisateur dans le navigateur.

```bash
npx vercel
```

## Structure

```
src/
  app/
    page.tsx              # Page de configuration (setup)
    discussion/page.tsx   # Page de discussion en temps reel
    results/page.tsx      # Page de resultats et export
    api/orchestrate/      # API route SSE pour le streaming
  components/
    AgentCard.tsx          # Carte de configuration d'un agent
    MessageBubble.tsx      # Bulle de message dans le chat
    TypingIndicator.tsx    # Indicateur de saisie en cours
  lib/
    types.ts              # Types TypeScript
    store.ts              # Hooks de state management
    templates.ts          # Templates de discussion pre-configures
    export.ts             # Export Markdown
```
