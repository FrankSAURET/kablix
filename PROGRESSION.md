# Progression — chantier afficheurs 7 segments (items 2-5)

## Contexte
Frank veut : brancher SES SVG `src/webview/composants/interne/7seg-*.schema.svg`
(couleurs + épaisseur fine) comme câblage interne affiché (bouton ☢), AU LIEU du
générateur `sevenSegment()` (noir, trait épais 2px). + diodes retournables selon
cathode/anode commune (`attrs.common`).

## Faits acquis
- Les SVG interne/7seg-*.schema.svg sont DÉJÀ dans le repère du corps (1dig :
  viewBox 60×90, broches alignées sur VARIANTS[1].pins). Groupe `#g3` = pastilles
  repère (à retirer), `#g4` = le vrai schéma (diodes + pistes noires/bleues).
- Générateur actuel : internal-wiring.mts `sevenSegment()` → `sevenSegmentFigure`
  (1dig) / `sevenSegmentStar` (2/4dig). Helper `diode(from,to,cathodeAtEnd)` gère
  déjà le sens. renderInternalWiring (editor.mts ~2965) force stroke #111 width 2.
- Pattern de branchement SVG existant : `parseSchema(svg)` + `scale(sx sy)` (clavier/pot).

## Décision finale (Frank) : STYLER LE GÉNÉRATEUR (pas de branchement des SVG bruts)
Le générateur `sevenSegmentFigure` EST déjà le schéma de Frank (positions extraites).
On l'a stylé + allégé le 2/4dig. Livré v2026.7.40.

## Fait (v2026.7.40)
1. ✅ 1dig : traits fins 0.6, réseau commun bleu (SEG_STROKE / COM_STROKE dans
   internal-wiring.mts). Diodes retournées via `diode(cathodeAtEnd=!commonAnode)`.
2. ✅ 2/4dig (`sevenSegmentStar` réécrit) : diode par segment posée près de sa broche
   (non reliée), bus bleu reliant DIG1..DIGn.
3. ✅ CLN + COM retirés de VARIANTS[4] (7segment-element.mts).

## Points ouverts à valider avec Frank (rendu headless : scripts/view-internal.mjs)
- 4dig : le bus DIG relie DIG1-2-3 (haut) puis descend en diagonale vers DIG4 (bas).
  Diagonale un peu disgracieuse — à ajuster si Frank préfère 2 bus séparés.
- Diodes 2/4dig petites et détachées de la broche — voulu (« non reliées »).

## Livré avant
- v2026.7.39 : posters pinout Uno/Mega + z-order pinout. Poussé.
