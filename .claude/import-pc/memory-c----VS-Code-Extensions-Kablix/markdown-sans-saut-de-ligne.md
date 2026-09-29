---
name: markdown-sans-saut-de-ligne
description: "Tous les .md de tous les projets — un paragraphe tient sur une seule ligne, jamais de coupure à 80 colonnes ni de « deux espaces » en pleine phrase."
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9b920022-2710-4427-82b5-d6e7849799e0
  modified: 2026-09-23T15:10:24.236Z
---

**Dans un `.md`, un paragraphe = une seule ligne.** Pas de retour à la ligne au milieu du texte pour le mettre en forme (paragraphe, puce, citation `>`), pas de saut forcé « deux espaces » en pleine phrase. Le retour à la ligne sépare des blocs, rien d'autre. Règle écrite dans le CLAUDE.md global.

**Why:** le 23/09/2026, Frank a relevé que je coupais mes textes à ~80 colonnes. Dans Kablix, 1 300 coupures environ dans 35 fichiers (roadmap.md en « deux espaces », vitesse-pico.md, les deux scénarios « Créer un composant », les fiches des composants de bibliothèque…) ; le modèle du README de `kablix_components/` dans `build-components-index.mjs` en produisait aussi.

**How to apply:** écrire chaque paragraphe d'un seul tenant. Markdown généré par un script : corriger le modèle dans le script. Ne pas toucher aux lignes « une phrase par ligne » écrites par Frank lui-même (USAGE.md, ses notes collées comme Promotion.md) : ce ne sont pas des coupures de mise en forme. Recollage en masse : script jetable, à réécrire au besoin — figer code, tableaux, front matter et commentaires HTML ; ne pas coller une ligne qui ouvre un bloc (puce, titre, `>`, image seule) ; garder une étiquette tout en gras sur sa ligne ; recoller le groupe entier dès qu'une coupure tombe en pleine phrase ; `trimEnd()` mange l'espace insécable et le « deux espaces » d'un saut voulu, retirer seulement `[ \t]`.
