# AI Arena — Product Requirements Document

**Version** : 1.0
**Date** : 11 fevrier 2026
**Auteur** : Equipe AI Arena

---

## Elevator Pitch

> **AI Arena est une arene de discussion multi-agents ou des IA de differents fournisseurs debattent, collaborent et produisent des livrables sur n'importe quel sujet — le tout orchestre en temps reel par une IA dediee.**
>
> En 30 secondes, vous choisissez un sujet et un template (debat, brainstorm, specs produit, comite de direction…), et des agents IA aux personnalites distinctes commencent a echanger en streaming sous vos yeux. Vous pouvez observer, intervenir ou diriger la discussion. A la fin : synthese, votes, livrable exportable.
>
> AI Arena transforme les LLMs d'outils individuels en equipes collaboratives. C'est comme organiser une reunion d'experts — sans l'agenda, les ego, ni les 2h de perdu.

---

## 1. Vision et positionnement

### 1.1 Probleme

Les LLMs sont utilises en mode monologue : un humain pose une question, un modele repond. Cette approche a trois limites :

1. **Biais de confirmation** — Un seul modele tend a renforcer son propre raisonnement sans contradiction
2. **Manque de diversite** — Les perspectives sont limitees a un seul provider/modele
3. **Pas de dynamique de groupe** — Les meilleures idees emergent du dialogue, de la contradiction et de l'iteration

### 1.2 Solution

AI Arena cree un espace ou **2 a 6 agents IA** de fournisseurs differents (Claude, GPT, Gemini) discutent entre eux sur un sujet donne. Un **orchestrateur IA** distribue la parole intelligemment, detecte les points de convergence et sait quand conclure.

### 1.3 Proposition de valeur unique

| Existant | AI Arena |
|---|---|
| Chat 1-to-1 avec un LLM | Discussion de groupe multi-agents |
| Un seul provider | Multi-provider (Claude, GPT, Gemini) |
| Reponse statique | Debat dynamique en streaming |
| L'humain dirige tout | Orchestrateur IA intelligent |
| Resultat brut | Synthese, votes, livrable structure |

---

## 2. Utilisateurs cibles

### 2.1 Persona principal : Le decideur eclaire

**Profil** : Manager, chef de projet, entrepreneur, consultant
**Besoin** : Obtenir une analyse multi-perspective rapide avant de prendre une decision
**Douleur** : Organiser une reunion d'experts est couteux et lent ; demander a ChatGPT donne un seul point de vue
**Usage type** : "Faut-il migrer vers des microservices ?" → lance un comite de direction IA → obtient une synthese en 3 minutes

### 2.2 Persona secondaire : Le creatif productif

**Profil** : Redacteur, product manager, UX designer
**Besoin** : Generer des idees divergentes puis converger vers un livrable
**Usage type** : "Brainstorm sur le naming de notre produit" → 3 agents creatifs challengent les idees → livrable final avec recommandations

### 2.3 Persona tertiaire : Le curieux exploratoire

**Profil** : Etudiant, chercheur, autodidacte
**Besoin** : Explorer un sujet sous tous les angles
**Usage type** : "Les enjeux ethiques de l'IA generative" → debat structure pour/contre/neutre → synthese pedagogique

---

## 3. Fonctionnalites

### 3.1 V1 — Socle (Implemente)

| Feature | Description | Statut |
|---|---|---|
| **Configuration multi-agents** | 2 a 6 agents configurables (nom, role, personnalite, provider, modele) | Done |
| **Multi-provider** | Claude (Anthropic), GPT (OpenAI), Gemini (Google) dans la meme discussion | Done |
| **Orchestrateur IA** | Claude Haiku distribue la parole, detecte convergence/stagnation, conclut au bon moment | Done |
| **3 modes de discussion** | Exploration (brainstorm), Decision (debat + vote), Livrable (production iterative) | Done |
| **3 modes utilisateur** | Observateur, Interventionniste (messages/recadrage/relance), Directeur (pause/synthese/vote force) | Done |
| **Streaming temps reel** | Reponses affichees token par token via SSE | Done |
| **Synthese automatique** | Generation d'une synthese structuree en fin de discussion | Done |
| **Phase de vote** | En mode Decision, chaque agent vote et argumente | Done |
| **Generation de livrable** | En mode Livrable, production d'un document final integrant toutes les contributions | Done |
| **Metriques detaillees** | Tokens/agent, cout estime, duree, repartition de parole | Done |
| **Export Markdown** | Telechargement de tout le transcript + synthese + metriques | Done |

### 3.2 V2 — Experience utilisateur (Implemente)

| Feature | Description | Statut |
|---|---|---|
| **9 templates pre-configures** | Debat, Comite de direction, Brainstorm, Revue technique, Co-ecriture, Negociation, Specs produit, Soutien psychologique | Done |
| **Sliding context window** | Gestion de la memoire pour les longues discussions (resume des messages anciens) | Done |
| **Smart auto-scroll** | Scroll automatique qui respecte la lecture utilisateur (detection scroll-up) | Done |
| **Saisie vocale** | Dictee du sujet et des interventions via Web Speech API | Done |
| **Interface progressive** | Options avancees masquees par defaut, decouverte guidee | Done |
| **Template selection visuelle** | Feedback visuel (checkmark, bordure accent) sur la selection | Done |
| **Actions fin de discussion** | Copier, telecharger .md, continuer (+5 tours), voir resultats | Done |
| **Boucle de feedback** | Note sur 5 + commentaire optionnel apres chaque discussion, stocke en localStorage | Done |
| **Optimisation des couts** | Modeles eco par defaut (Haiku, GPT-4o-mini, Flash), cout moyen ~$0.10/conversation | Done |
| **Liens API directs** | Liens vers les pages de gestion des cles pour chaque provider | Done |

### 3.3 V3 — Roadmap

| Feature | Description | Priorite |
|---|---|---|
| **Historique des sessions** | Sauvegarder et reprendre des discussions passees | Haute |
| **Templates personnalises** | Creer, sauvegarder et partager ses propres configurations | Haute |
| **Partage de session** | URL partageable pour montrer une discussion terminee | Moyenne |
| **Mode equipe** | Plusieurs humains observent/interviennent dans la meme discussion | Moyenne |
| **Analytics dashboard** | Tableau de bord des feedbacks, couts, usages agreges | Moyenne |
| **Whisper/TTS** | Synthese vocale des reponses + transcription audio avancee | Basse |
| **Plugins/Outils** | Agents avec acces web, calcul, base de donnees | Basse |
| **API publique** | Lancer des discussions multi-agents par API | Basse |

---

## 4. Architecture technique

### 4.1 Stack

| Couche | Technologie |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Backend** | Next.js API Routes (Edge Runtime) |
| **Streaming** | Server-Sent Events (SSE) |
| **IA - Agents** | Anthropic SDK, OpenAI SDK, Gemini (via endpoint compatible OpenAI) |
| **IA - Orchestrateur** | Claude Haiku 4 (appel non-streaming pour decision JSON) |
| **Deploiement** | Vercel (Edge Functions) |
| **Stockage client** | sessionStorage (config, resultats), localStorage (feedback) |

### 4.2 Flux de donnees

```
[Utilisateur] → Configure la session (topic, template, cles API)
      ↓
[sessionStorage] → Stocke config + cles
      ↓
[Page Discussion] → Boucle principale :
      ↓
  ┌─────────────────────────────────────────────┐
  │  1. /api/orchestrator → Qui parle ? (JSON)  │
  │  2. /api/orchestrate  → Agent parle (SSE)   │
  │  3. Affiche message en streaming             │
  │  4. Repete jusqu'a maxTurns ou convergence   │
  └─────────────────────────────────────────────┘
      ↓
[Phase finale] → Vote (decision) ou Livrable (deliverable)
      ↓
[Synthese] → Generation automatique
      ↓
[Resultats] → Affichage + Export
```

### 4.3 Securite

- **Zero stockage serveur** : aucune donnee persistee cote serveur
- **Cles API client-side** : stockees en sessionStorage (efface a la fermeture de l'onglet), jamais logguees
- **Edge Runtime** : pas d'acces filesystem, surface d'attaque minimale
- **Cles transmises par requete** : passees au body de chaque appel API, non stockees dans les headers partages

### 4.4 Performance

- **Streaming SSE** : feedback immediat, pas d'attente de reponse complete
- **Sliding context** : les discussions longues (>20 messages) utilisent un resume des anciens messages pour eviter de depasser les limites de contexte
- **Modeles eco par defaut** : Claude Haiku ($0.80/M input), GPT-4o-mini ($0.15/M input), Gemini Flash ($0.10/M input)
- **Edge Runtime** : latence minimale, deploiement global

---

## 5. Modeles economiques

### 5.1 Cout par conversation

| Scenario | Modele | Tours | Cout estime |
|---|---|---|---|
| Brainstorm rapide | Haiku x3 | 10 | ~$0.05 |
| Debat standard | Haiku x3 | 12 | ~$0.08 |
| Comite de direction | Haiku x4 | 16 | ~$0.12 |
| Revue technique | Sonnet x3 | 12 | ~$0.50 |
| Multi-provider | Haiku + GPT-4o-mini + Flash | 12 | ~$0.06 |

### 5.2 Modele freemium envisage

| Tier | Prix | Inclus |
|---|---|---|
| **Free** | 0 | 3 discussions/jour, modeles eco uniquement, templates de base |
| **Pro** | $15/mois | Illimite, tous modeles, templates custom, historique, export |
| **Team** | $40/mois | Pro + mode equipe, analytics, templates partages |

### 5.3 Monetisation alternative : BYOK (Bring Your Own Key)

Le modele actuel ou l'utilisateur fournit ses propres cles API est un avantage competitif :
- **Zero cout d'infrastructure IA** pour le produit
- **Pas de marge sur les tokens** — l'utilisateur paie directement les providers
- **Confiance** — pas d'intermediaire sur les donnees
- La monetisation porte sur la **valeur d'orchestration**, pas sur la revente de tokens

---

## 6. Metriques cles (KPIs)

| Metrique | Objectif M+3 | Objectif M+12 |
|---|---|---|
| Utilisateurs actifs mensuels (MAU) | 500 | 10 000 |
| Discussions lancees/mois | 2 000 | 50 000 |
| Taux de completion (discussion terminee) | > 80% | > 85% |
| Note moyenne (feedback 1-5) | > 3.8 | > 4.2 |
| Cout moyen/discussion | < $0.10 | < $0.05 |
| Templates custom crees (V3) | - | 1 000 |

---

## 7. Concurrence et differenciateurs

| Produit | Approche | Limite | AI Arena se differencie |
|---|---|---|---|
| ChatGPT / Claude.ai | Chat 1-to-1 | Un seul modele, pas de dynamique | Multi-agents, multi-providers, debat |
| AutoGen / CrewAI | Frameworks dev | Requiert du code, pas d'UI | Interface no-code, pret a l'emploi |
| ChatArena (research) | Benchmark LLMs | Academique, pas orienté productivite | Templates metier, livrables concrets |
| Custom GPTs | Agents specialises | Un seul agent, pas d'interaction | Agents qui s'inter-challengent |

---

## 8. Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Couts API eleves pour l'utilisateur | Frein a l'adoption | Modeles eco par defaut, affichage du cout en temps reel |
| Qualite variable des discussions | Frustration | Orchestrateur IA, templates optimises, detection stagnation |
| Dependance aux providers | Rupture de service | Multi-provider, fallback round-robin si orchestrateur echoue |
| Securite des cles API | Fuite de donnees | sessionStorage (pas de persistance), zero stockage serveur |
| Hallucinations amplifiees | Desinformation | Agents se challengent mutuellement, mode contradictoire |

---

## 9. Templates disponibles

| Template | Mode | Agents | Tours | Usage |
|---|---|---|---|---|
| **Debat contradictoire** | Decision | Defenseur, Opposant, Moderateur | 12 | Trancher une question controversee |
| **Comite de direction** | Decision | CEO, CTO, CFO, CMO | 16 | Decision strategique d'entreprise |
| **Brainstorm creatif** | Exploration | Visionnaire, Pragmatique, Avocat du diable | 15 | Generer des idees innovantes |
| **Revue technique** | Livrable | Architecte, Dev Senior, SRE | 12 | Recommandation technique argumentee |
| **Atelier co-ecriture** | Livrable | Redacteur, Editeur, Creatif | 10 | Co-produire un texte de qualite |
| **Negociation** | Decision | Partie A, Partie B, Mediateur | 14 | Trouver un accord gagnant-gagnant |
| **Specs produit** | Livrable | Product Manager, Designer UX, Tech Lead | 16 | Specifier un produit depuis le besoin |
| **Soutien psychologique** | Exploration | Psychologue, Coach bien-etre, Pair aidant | 18 | Accompagner une personne en difficulte |

---

## 10. User stories principales

1. **En tant qu'** utilisateur, **je veux** choisir un template et entrer un sujet **pour** lancer une discussion en moins de 30 secondes
2. **En tant qu'** utilisateur, **je veux** voir les agents debattre en temps reel **pour** suivre la construction des arguments
3. **En tant qu'** interventionniste, **je veux** envoyer des messages, recadrer ou relancer la discussion **pour** influencer la direction du debat
4. **En tant qu'** directeur, **je veux** forcer un vote ou un livrable a tout moment **pour** obtenir un resultat quand je le juge necessaire
5. **En tant qu'** utilisateur, **je veux** copier, telecharger ou continuer la discussion a la fin **pour** exploiter les resultats
6. **En tant qu'** utilisateur, **je veux** voir le cout en temps reel **pour** controler mes depenses API
7. **En tant qu'** utilisateur, **je veux** dicter mon sujet a la voix **pour** lancer une discussion rapidement sur mobile

---

*Document genere par AI Arena — La reunion d'experts la plus rapide au monde.*
