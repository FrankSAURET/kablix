---
name: kablix-retouche-pipeline
description: "Pipeline d'intégration des SVG retouchés (svg retouche/ → externe/) + cas des composants interactifs (élément Lit transparent calé sur le dessin)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 489b00ee-99de-4cbd-9637-ff7ab9bac58f
---

**Depuis v2026.6.87** ([[kablix-fork-wokwi-elements]]) : les retouches doivent se faire **directement dans les forks** `src/webview/composants/*-element.mts` (modèle : slide-potentiometer-element.mts — renderSVG remplacé + pinInfo recalé sur grille de 10 px). Le pipeline overlay ci-dessous reste en place pour les dessins déjà intégrés mais est l'ancien mécanisme.

Intégrer un `svg retouche/<type>.edit.svg` (suffixes `.OK/.ok/.PB` acceptés) :
1. `node scripts/_clean-board-svg.mjs <type> …` → `src/webview/composants/externe/<type>.svg` (Chrome headless).
2. `node scripts/_probe-overrides.mjs <type> …` → bloc TS pour `pin-overrides.mts`, convention **« tel quel »** (repère = coin haut-gauche du viewBox, PAS l'ancienne formule −origine−20 : elle ne vaut que pour les composants SANS dessin, ex. keypad).
3. Entrée dans `board-drawings.mts` (import + DRAWINGS).

**Interactifs** (button, button-6mm, dip-switch, joystick — v2026.6.83) : l'élément @wokwi n'est PAS masqué (`part__src-el--live` : opacity 0, cliquable) et est calé sur les pastilles par ajustement affine `alignLiveElement` (editor.mts) ; retour visuel via `attachInteractiveFeedback` (drawing-feedback.mts) qui suppose dans le dessin : `.button-active-circle` (boutons), `use #switch` (DIP, y=-7,2 si ON), `#knob` avec transform matrix (joystick).

Pièges vus : Inkscape perd `id="board"` et suffixe les ids dupliqués (`pin-VSS-1`) ; `svg retouche/Validé/` = archive (non lue par les scripts). **pot** retouché et intégré en fork direct en v2026.7.4 (`GND/SIG/VCC` = 40/50/60,y=80 ; centre de rotation = ellipse `#knob` du dessin ; `getScreenCTM()` natif, plus de CTM workaround). Cf. [[kablix-autoroute-headless-repro]].

Deux pièges de plus (v2026.7.93) : (1) les templates Wokwi contiennent des placeholders `${uniqueId}` dans les `url(#…)` — Inkscape les URL-encode en `$%7BuniqueId%7D` dans le `style` inline, qui GAGNE sur l'attribut `fill` correct → référence de gradient invalide = élément peint `none` (invisible) ; nettoyer le style inline au moment de l'intégration (bouton 6 mm : `.button-active-circle` invisible = effet appuyé disparu). (2) Un `.edit.svg` viewBox N×M suit la convention **1:1 px** : le wrapper `<svg>` du fork doit rendre `width=N height=M` (le buzzer rendait 50×60 étiré à 64×75 → pastilles hors des pattes) ; tout ornement hors dessin (note de musique du buzzer) doit être en `position:absolute` pour ne pas décaler le repère pinInfo.
