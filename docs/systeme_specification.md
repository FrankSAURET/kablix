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
| `params` | propres au type (rapport d'engrenage, bornes…) ; liste fixée par le solveur du lot D2 |

Champs inconnus (ici ou à la racine, comme l'état de l'éditeur) : ignorés à la lecture, **conservés** à l'enregistrement — Kablix regrave le document brut.

## Contrôles faits à l'ouverture dans Kablix

Un avertissement d'une ligne, sans bloquer l'ouverture, quand :

- le document est illisible ou vient d'une version plus récente ;
- une pièce désigne un repère absent du schéma (`ref-absente`), ou deux pièces le même repère (`ref-doublon`) ;
- un fichier désigné manque sous `system/` (`fichier-absent`) ;
- une pièce ou une liaison est illisible, en double ou désigne une pièce absente (écartée de la lecture, gardée dans le fichier).

## Ce qui reste à faire

- Kompix Editor : écrire et relire ce document (partie Kompix Editor du lot D1, par consigne à son dossier).
- Kablix : faire suivre un renommage de repère (`renommerRepere()` existe, pas encore branché à l'inspecteur) ; vue 3D (lot D6).
