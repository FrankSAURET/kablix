# Document système du `.projix` (montage 3D)

Piste 11, lot D1. Le montage mécanique d'un projet — pièces posées, poses, liaisons — vit dans le `.projix`, à côté du schéma électrique (décision de Frank, 20/11/2026). Kompix Editor l'écrit ; Kablix le lit, le contrôle contre le schéma et le regrave à l'identique à chaque enregistrement. Lecture et contrôle : [src/systeme.ts](../src/systeme.ts). Banc : `npm run verify:systeme`.

## Place dans l'archive

| Entrée | Contenu |
| --- | --- |
| `kablix.json` | manifeste (inchangé) |
| `diagram.json` | schéma électrique (inchangé) |
| `system.json` | **document système**, facultatif |
| `system/…` | fichiers désignés par le document (maillages `.glb`/`.stl`, contours) ; lus et regravés seulement si `system.json` existe |

Un projet sans montage n'a ni `system.json` ni `system/`. Un `system.json` illisible n'empêche pas d'ouvrir le projet.

## Conventions

Reprises du format `model3d.json` v2 de Kompix Editor : millimètres ; X à droite, Y à l'arrière, Z en haut ; rotation `{ x, y, z }` en degrés, autour de X puis Y puis Z, appliquée avant la position.

## Format (version 1)

```json
{
  "format": "kablix-system",
  "version": 1,
  "pieces": [
    { "id": "chassis", "source": { "kind": "fichier", "path": "meshes/chassis.stl" }, "pose": { "pos": { "x": 0, "y": 0, "z": 0 }, "rot": { "x": 0, "y": 0, "z": 0 } } },
    { "id": "servo", "nom": "servo:Act1", "ref": "Act1", "source": { "kind": "kompix", "type": "servo" }, "pose": { "pos": { "x": 10, "y": 5, "z": 12 }, "rot": { "x": 0, "y": 0, "z": 90 } } },
    { "id": "aimant", "nom": "aimant:A1", "ref": "A1", "source": { "kind": "kompix", "type": "aimant" }, "pose": { "pos": { "x": 30, "y": 5, "z": 25 }, "rot": { "x": 0, "y": 0, "z": 0 }, "miroir": true } }
  ],
  "liaisons": [
    { "id": "L1", "type": "encastrement", "a": { "piece": "servo" }, "b": { "piece": "chassis" } },
    { "id": "L2", "type": "pivot", "a": { "piece": "aimant", "axe": "horn" }, "b": { "piece": "servo", "axe": "horn" }, "params": { "min": 0, "max": 180 } }
  ]
}
```

### Pièce

| Champ | Rôle |
| --- | --- |
| `id` | identifiant unique dans le document, désigné par les liaisons |
| `nom` | nom libre ; la convention `rôle:repère` (lot D5) s'y lira |
| `ref` | repère du composant dans le schéma (`Act1`, `M2`, `U1`…) ; absent = pièce purement mécanique (châssis, roue folle, décor) |
| `source` | `{ "kind": "kompix", "type": "<type du composant>" }` ou `{ "kind": "fichier", "path": "<chemin sous system/>" }` — chemin relatif, sans `..` ni lettre de lecteur |
| `pose` | `pos` et `rot` (`{ x, y, z }`), `miroir` facultatif |

### Liaison

| Champ | Rôle |
| --- | --- |
| `id` | identifiant unique |
| `type` | `encastrement`, `pivot`, `glissiere`, `engrenage`, `roue-sol` |
| `a`, `b` | `{ "piece": "<id>", "axe": "<axe nommé>" }`, `axe` facultatif |
| `params` | propres au type (bornes, rapport d'engrenage, rayon…) : voir « Paramètres et sens des liaisons » |

### Paramètres et sens des liaisons (lot D2)

Règle commune : **`a` est l'enfant, `b` le parent** (l'aimant pivote sur le servo, le servo est encastré dans le châssis). Les poses du document sont la position de référence : chaque variable de liaison y vaut son `zero`. Le solveur (kompix-core, `kinematics.ts`) part des pièces sans parent et descend l'arbre ; il n'y a ni masse ni frottement (cinématique seule, décision de Frank du 20/11/2026).

| Type | Variable | `params` | Effet |
| --- | --- | --- | --- |
| `encastrement` | aucune | aucun | l'enfant garde sa pose relative au parent |
| `pivot` | angle en degrés | `min`, `max` (bornes, facultatives), `zero` (angle de la pose du document, 0 par défaut) | l'enfant tourne de `q − zero` autour de l'axe `b.axe` du parent (point et direction de l'axe nommé, règle de la main droite) ; `a.axe`, s'il est donné, doit exister (sa coïncidence avec `b.axe` n'est pas contrôlée) ; hors bornes → arrêté à la borne et signalé (saturation), sans erreur |
| `glissiere` | course en mm | `min`, `max`, `zero` | l'enfant se translate le long de la direction de `b.axe` |
| `engrenage` | aucune (couplage) | `dentsA`, `dentsB` (entiers > 0) ou `rapport` (= vitesse de B / vitesse de A), `interne` (booléen, faux par défaut) | n'ajoute pas d'arête à l'arbre : l'angle du pivot qui porte B suit celui du pivot qui porte A, `θB − zeroB = k·(θA − zeroA)`, avec `k = −dentsA/dentsB` (positif si `interne`) ou `k = rapport` s'il est donné (signé, pris tel quel, `interne` alors sans effet) ; chaînes permises, bornes du pivot mené appliquées après le couplage, valeur fournie pour un pivot mené ignorée (`variable-menee`) |
| `roue-sol` | aucune (couplage) | `rayon` (mm, obligatoire) | `a` = roue (enfant d'un pivot), `b` = sol ; le parent du pivot de la roue (le châssis) devient mobile sur le plan Z = 0 du sol : une roue → ligne droite, deux roues sur un même axe → conduite différentielle (`rayon × angle`, sans glissement) |

Refusés clairement (problème signalé, pièces concernées laissées à leur pose du document) : **boucle fermée** (une pièce enfant de deux liaisons, ou un cycle de liaisons ; parallélogramme, bielle-manivelle — plus tard), axe nommé absent, engrenage dont un côté n'est pas porté par un pivot, couplages en cycle, `roue-sol` sans rayon, plus de deux roues motrices ou roues sur des axes différents.

Codes rendus par le solveur (`{ code, target }`, `target` = id de la liaison) : `boucle-fermee`, `axe-absent`, `engrenage-sans-pivot`, `parametre-invalide` (engrenage sans `rapport` non nul ni `dentsA`/`dentsB` positifs), `couplage-cycle` (engrenages en cycle, ou pivot mené par deux engrenages), `roue-sans-rayon`, `roue-sans-pivot` (roue qui n'est pas l'enfant d'un pivot accepté), `roues-incompatibles`, `type-inconnu` (liaison d'un type futur, ignorée sans erreur) ; `variable-menee` est rendu par `solve`, pas à la construction. Un axe nommé sans direction est pris selon Z. La pose monde d'une pièce quelconque peut être imposée (`base`, le châssis qui roule) : sa liaison parente est alors ignorée. Détail de l'API : `docs/cinematique.md` de Kompix Editor (v2026.10.0.15).

Champs inconnus (ici ou à la racine, comme l'état de l'éditeur) : ignorés à la lecture, **conservés** à l'enregistrement — Kablix regrave le document brut.

## Contrôles faits à l'ouverture dans Kablix

Un avertissement d'une ligne, sans bloquer l'ouverture, quand :

- le document est illisible ou vient d'une version plus récente ;
- une pièce désigne un repère absent du schéma (`ref-absente`), ou deux pièces le même repère (`ref-doublon`) ;
- un fichier désigné manque sous `system/` (`fichier-absent`) ;
- une pièce ou une liaison est illisible, en double ou désigne une pièce absente (écartée de la lecture, gardée dans le fichier).

## Ce qui reste à faire

- Kompix Editor : écriture et relecture du document (`system.ts`, v2026.10.0.14) et solveur cinématique (`kinematics.ts`, v2026.10.0.15) faits ; animation du montage dans sa visionneuse, sur demande de Frank.
- Kablix : faire suivre un renommage de repère (`renommerRepere()` existe, pas encore branché à l'inspecteur) ; vue 3D (lot D6).
