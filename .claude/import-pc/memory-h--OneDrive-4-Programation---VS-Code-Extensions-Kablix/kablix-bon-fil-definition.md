---
name: kablix-bon-fil-definition
description: "Définition complète d'un « bon fil » (fil propre préservé par l'autoroutage) — H/V, ≤4 coudes, pas de survol composant/broche/fil."
metadata: 
  node_type: memory
  type: project
  originSessionId: b10e65ff-3839-494a-9de0-e43bb436c381
  modified: 2026-07-25T08:02:43.113Z
---

Définition Frank d'un **« bon fil »** (= fil propre que l'autoroutage NE DOIT PAS rerouter). Codé dans `editor.mts` (~ligne 2840, branche préservation de `autoRoute`) et posé en todo v antérieure à 2026.7.174.

Un fil est GARDÉ INTACT (aucun coude ajouté, seule l'optimisation colinéaire — qui ne déplace rien — s'applique) si sa polyligne complète (broches a/b comprises) :
1. est faite **uniquement de segments H ou V** (chaque segment : dx≤TOL ou dy≤TOL) ;
2. compte **≤ 4 coudes** ;
3. **ne survole aucun composant** — sauf le ras du corps de ses DEUX extrémités (tolérance `ENDCAP = 1,5·GRID`, la broche vit au bord de son corps) ;
4. **ne se superpose à aucun autre fil** d'une équipotentielle différente ;
5. **ne passe sur aucune broche étrangère** (les 2 broches propres du fil exclues).

Cas particulier « ligne droite prioritaire » (branche suivante) : 2 broches alignées H/V + segment direct dégagé → 0 coude même au ras des corps ; un fil droit qui TRANCHERAIT un corps de part en part (broches sous le corps) dépasse ENDCAP et repasse par le routeur A*.

Régression signalée v2026.7.175 (todo « À faire ») : des bons fils droits directement connectés aux pins sont quand même reroutés, et certains reroutages FONT TRAVERSER un composant (pire qu'avant). Repro via harnais headless — voir [[kablix-autoroute-headless-repro]]. Voir aussi [[kablix-versioning-scheme]].

**Corrigé v2026.7.176.** Cause racine : la préservation rejetait un fil droit dès qu'il RASAIT un tiers (rangée serrée à 10 px), puis l'A\* le reroutait PIRE. Trois leviers dans `autoRoute` (editor.mts) :
1. `segRectDeepCross(p,q,rect,inset=4)` (helper avant `segAxis`) : ne mesure que la traversée du CŒUR du corps (rect rétréci de `DEEP=4`). Remplace `segRectOverlap` pour les TIERS dans les deux branches (préservation `overComp` + ligne droite `blocked`) ; les corps d'EXTRÉMITÉ gardent `segRectOverlap`/`ENDCAP=1,5·GRID`. → le ras d'un voisin ne disqualifie plus.
2. Garde-fou « ne jamais dégrader » (avant d'écraser le fil) : `scorePoly` factorisé hors de `cost`, on compare score ORIGINAL vs rerouté et on garde le meilleur. Empêche un rerouté pire en montage dense.
3. Faux positifs de la comparaison : ne comparer QUE si l'original est déjà orthogonal (`origOrtho` H/V — sinon `segRectDeepCross` aveugle aux diagonales fausse la balance, un fil neuf diagonal laisse la main au rerouté) ; `deepEnds` (perforation profonde des corps d'extrémité, ×1000) taxée des DEUX côtés → 2 LED empilées bien détournées SANS casser le recouvrement d'une branche même-net sur sa dorsale (verify:route cas 6 + cas 7 + colonne PCA).
