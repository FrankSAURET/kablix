---
name: changelog-style-concis
description: "Les entrées de CHANGELOG doivent tenir en une ou deux phrases courtes, sans explication technique ni justification."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 13a5d5ce-9366-487e-8866-e8b5fb5bb7e4
  modified: 2026-09-12T14:18:37.204Z
---

Frank a raccourci à la main les entrées du CHANGELOG de la 2026.9.4 (12/09/2026) : il a coupé toutes les explications de cause, les détails d'implémentation, les valeurs mesurées et les parenthèses de contexte. Une entrée = le fait utilisateur, une ou deux phrases courtes.

**Why:** le CHANGELOG n'est lu que par lui, et il connaît déjà le détail — il le suit en direct et dans `todo.md`. La verbosité n'apporte rien et alourdit la lecture.

**How to apply:** écrire chaque entrée comme un titre gras suivi d'une phrase de conséquence, point. Pas de « la cause était », pas de « contrairement à », pas de chiffres de mesure, pas de renvoi au code. Le détail complet reste dans `todo.md`, qui garde son niveau actuel. Voir [[kablix-versioning-scheme]].
