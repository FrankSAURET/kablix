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

## Décision RÉVISÉE (Frank, après v40) : BRANCHER SES SVG (générateur abandonné)
v40 (générateur stylé) était mauvais : échelle 1dig fausse, 2/4dig faux. Frank veut
SES fichiers interne/7seg-*.schema.svg tels quels. → v41 : clean + branchement +
flip anode. Générateur procédural supprimé de internal-wiring.mts.
Pipeline : _clean-7seg-schema.mjs (retire broches repère) → *.clean.svg ;
_flip-7seg-diodes.mjs (rotation 180° triangle+barre) → *.anode.svg.
Import + registre SEVEN_SEG_SCHEMA dans internal-wiring.mts, scale box/viewBox.

## RESTE (à préciser avec Frank)
- Dessin EXTERNE 2dig/4dig « pas bon » — pas compris quoi exactement. Demander.

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
