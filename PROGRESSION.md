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

## BUG EN COURS (v43 « pire ») — calage câblage interne 7seg
Reproduit via scripts/view-7seg-editor.mjs (reproduit fidèlement le rendu éditeur :
hotspots via pinPos snap, câblage via internalWiringSvg box=offsetW/H).
CONSTAT 4dig : le câblage (viewBox 0-200) s'étale sur tout le body, MAIS les
hotspots pinInfo sont à x=70-120 (CENTRÉS). → câblage et broches en repères X
différents = gros décalage horizontal. Idem en Y possible.

Bornes Y mesurées du tracé (bbox.mjs) : 1dig 9.43-80.11, 2dig 9.93-73.61 (h viewBox
85.8 !), 4dig 9.88-79.91. Le SCHEMA_PIN_TOP/BOT fixe (9.55/79.95) de v43 est faux
pour le 2dig.

DEUX causes possibles / corrections :
A) VARIANTS[4].pins ont des X trop resserrés (70-120) vs dessin 200 large → corriger
   pinInfo pour étaler les broches (CASSE les schémas déjà câblés par Frank).
B) Le câblage doit être CALÉ sur pinInfo en X ET Y (comme un poster) : mapper
   [schema xmin/xmax, ymin/ymax des broches du tracé] → [pinInfo xmin/xmax, ymin/ymax].
   Ne touche pas pinInfo. PRÉFÉRÉ.

→ Implémenter B : dans sevenSegment, caler X et Y du schéma sur les broches réelles
   (pas juste scale box). Mesurer les bornes du tracé par variante (ou détecter).
   À VALIDER : les broches du SCHÉMA de Frank correspondent-elles aux mêmes X que
   pinInfo une fois calées ? (le schéma étale sur 4 chiffres, pinInfo centré...).

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
