---
name: kablix-analyseur-page-grise-cause-racine
description: "Page grise de l'analyseur — PREMIÈRE cause (v2026.9.4.122), réelle mais pas suffisante ; la vraie est dans kablix-webview-serializer-restauration."
metadata: 
  node_type: memory
  type: project
  originSessionId: 874b5f3f-d324-4132-b67a-71df4499759c
  modified: 2026-09-23T16:48:51.900Z
---

**ATTENTION, ce n'était PAS la cause de la page grise de Frank.** Le défaut décrit ici est réel et le correctif tient, mais Frank voyait toujours la page grise après coup. La vraie cause a été trouvée le 23/09/2026 : [[kablix-webview-serializer-restauration]] — aucun `WebviewPanelSerializer`, donc un onglet restauré au redémarrage de VS Code ne recevait plus rien. Leçon : un correctif qui répare un vrai défaut ne prouve pas qu'on tenait LE défaut.

**Première cause (trouvée le 22/09/2026, lot v2026.9.4.122)** : `pousserVoiesLogiques()`
était appelé HORS du garde `loadingProject` dans `editor.onChange` (`sim.mts`). Il
partait donc à chaque étape du montage d'un projet — `clear()` notifie sur schéma
vide, puis les composants sont posés AVANT les fils. Une sonde reliée par un FIL
n'a alors aucune broche et ressort `not-mcu` / `nowhere`. Ce message arrivait
APRÈS le `restaure` de l'hôte (deux canaux, aucun ordre garanti), et
`declarerVoies()` ne retenant que les voies saines, **les fronts étaient détruits** —
sans retour possible. 4 des 5 fichiers de test ont une pince résolue par un fil.

Corrigé des deux côtés : garde `loadingProject` dans `sim.mts` + poussée explicite
une fois le schéma complet (`loadProject` ET import Wokwi, sinon plus aucune voie
n'arrive puisque le `notify()` final de `loadDiagram` tombe pendant le chargement) ;
et dans `analyseur.mts`, un message dont TOUTES les voies sont en défaut est ignoré
hors simulation.

**Le critère doit rester étroit.** « Aucune piste utile pour les broches capturées »
est trop large : c'est aussi ce que produit un vrai changement de schéma (second
projet, pince déplacée), où la capture DOIT céder la place. Ma première version
cassait `verify-analyseur-rendu`. Le bon critère est « toutes les voies en défaut ».

**Pourquoi trois lots (.118/.119/.120) sont passés verts** : `verify-analyseur-rendu.mjs`
se sert d'une capture JOUET (2 voies, 5 fronts) qu'il fabrique lui-même. Il ne pouvait
structurellement pas voir un défaut qui détruit les fronts d'une capture RÉELLE dans un
enchaînement RÉEL. D'où `verify-analyseur-projix.mjs` : vraies captures des `.projix`,
4 enchaînements, pixels comparés piste par piste, tolérance nulle.

**Méthode qui a payé** : cesser de raisonner sur le code, rejouer les vraies captures
dans l'onglet réel (Chrome headless) selon six enchaînements, compter les pixels piste
par piste. Trois pistes fermées par la mesure (enregistrement, résolution des broches,
rendu nominal) avant de trouver la bonne. Voir [[kablix-bancs-gestes-souris-reels]] :
même principe, un banc qui fabrique ses propres données ne prouve rien.

**Contre-épreuve** : neutraliser la correction DANS LE SOURCE (jamais `git stash`, cf.
[[ne-jamais-modifier-fichiers-sans-demander]]). Un contrôle sur le texte source doit
ancrer son motif en début de ligne (`/\n\s*if \(…/`), sinon un `false &&` le laisse vert.
