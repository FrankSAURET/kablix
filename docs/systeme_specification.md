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
    { "id": "L2", "type": "pivot", "a": { "piece": "aimant", "axe": "pose" }, "b": { "piece": "servo", "axe": "horn" }, "params": { "min": 0, "max": 180 } }
  ]
}
```

### Pièce

| Champ | Rôle |
| --- | --- |
| `id` | identifiant unique dans le document, désigné par les liaisons |
| `nom` | nom libre ; s'il suit la convention `rôle:repère`, il donne à la pièce son rôle de simulation : voir « Convention de nommage » |
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

### Convention de nommage (lot D5)

Le nom d'une pièce lui donne un **rôle de simulation** (décision de Frank du 20/11/2026 : `rôle:repère`). Il sert surtout quand seul le nom existe : pièce maillée, arbre d'un assemblage STEP importé (lot D8). Une pièce sans rôle reste **inerte** (structure, décor) : elle bouge avec ses liaisons, la simulation ne la pilote pas et ne la lit pas.

**Syntaxe** : `<rôle>:<repère>`, coupé au PREMIER `:` ; espaces de tête et de fin retirés de chaque côté. Le rôle se compare sans tenir compte de la casse (`Servo:Act1` = `servo:Act1`) ; le repère garde la sienne (`Act1`, comme dans le schéma). Un nom sans `:` n'a pas de rôle, sauf `sol` (seul rôle sans repère). Les suffixes que les logiciels de CAO ajoutent aux noms (`servo:Act1 (1)`, `<1>`, `.001`) ne sont pas reconnus en v1 : ils se traiteront avec l'import STEP (D8).

| Rôle | Le repère désigne | Types de composant acceptés | Ce que la simulation en fera |
| --- | --- | --- | --- |
| `servo` | le composant lui-même | `servo` | angle simulé → variable du pivot dont la pièce est le parent (D6) |
| `moteur` | le composant lui-même | `moteur-dc` | vitesse simulée → variable du pivot dont la pièce est le parent (D6) |
| `aimant` | le composant lui-même | `aimant` | position lue par les capteurs à effet Hall (D7) |
| `hall` | le composant lui-même | `hall` | lit la distance aux aimants (D7) |
| `roue` | le moteur ou le servo qui l'entraîne | `moteur-dc`, `servo` | tourne avec son moteur ; avec une liaison `roue-sol`, fait rouler le châssis (D6) |
| `sol` | aucun (nom exactement `sol`) | — | plan Z = 0, côté `b` des liaisons `roue-sol` |

Rôles **propres** (`servo`, `moteur`, `aimant`, `hall`) : le repère est celui de la pièce elle-même. Il tient lieu de `ref` quand `ref` est absent (repère effectif) ; si les deux sont donnés et diffèrent, `ref` l'emporte. Rôles **entraînés** (`roue`) : le repère désigne un AUTRE composant ; la pièce, purement mécanique, n'a pas de `ref` et plusieurs pièces peuvent porter le même nom (deux roues sur `M2`). Les capteurs de D7 (HC-SR04, fin de course) ajouteront leurs rôles à ce tableau le moment venu.

Contrôles (avertissements, jamais bloquants ; une pièce en défaut redevient inerte, le reste du montage marche) — `target` = id de la pièce :

| Code | Cas |
| --- | --- |
| `role-inconnu` | nom de la forme `x:y` dont le rôle `x` n'est pas au tableau (faute de frappe probable : `srevo:Act1`) ; un nom sans `:` n'est jamais signalé |
| `role-sans-repere` | rôle connu, repère vide (`servo:`), ou `sol:…` (le sol n'a pas de repère) |
| `role-ref-different` | rôle propre dont le repère diffère de `ref` (`ref` l'emporte) |
| `role-doublon` | deux pièces au même rôle propre et au même repère effectif |
| `role-type` | type incompatible avec le rôle : celui de `source` (`kompix`) pour un rôle propre ; celui du composant du schéma désigné, quand le schéma est connu (Kablix), pour tous les rôles |
| `role-repere-absent` | rôle entraîné dont le repère n'est pas dans le schéma (Kablix seulement) ; pour un rôle propre, c'est le `ref-absente` déjà existant, calculé sur le repère effectif |

Kompix Editor (kompix-core) lit et contrôle sans le schéma : syntaxe, rôles, doublons, type de `source`. Kablix ajoute les contrôles qui demandent le schéma (`role-type` par le schéma, `role-repere-absent`, `ref-absente` sur le repère effectif). Les deux affichent le rôle reconnu d'une pièce (inspecteur de Kompix Editor ; vue 3D de Kablix en D6).

Précisions communes aux deux mises en œuvre (`roles.ts` de kompix-core, `controlerRoles` de `src/systeme.ts`) : `role-ref-different` ne rend pas la pièce inerte, elle garde son rôle sur le repère de `ref` ; avec le schéma, le type de `source` reste contrôlé en plus (une pièce n'est signalée qu'une fois) ; `:Act1` (rôle vide) est un `role-inconnu`. Côté Kablix, `ref-doublon` se calcule aussi sur le repère effectif, sauf entre pièces déjà signalées `role-doublon` ; schéma illisible → contrôles par le schéma sautés.

### Bibliothèque mécanique de départ (lot D3)

Sept paquets `.kompix` 3D, tous Béta, dans `components/meca/` de Kompix Editor (v2026.10.0.17) ; détail des dimensions et exemple complet de robot à deux roues : `docs/bibliotheque.md` de Kompix Editor. Dimensions choisies d'après les pièces du commerce, à valider par Frank.

| Type | Pièce | Axes nommés | Propriétés | Simulation |
| --- | --- | --- | --- | --- |
| `servo` | SG90 avec palonnier | `horn` (arbre de sortie, dessus du palonnier), `fixation-1`, `fixation-2` | — | modèle Kablix `servo` (pattes `GND`, `V+`, `PWM`) |
| `moteur-dc` | motoréducteur TT, arbre double | `arbre` (selon X), `fixation-1`, `fixation-2` | — | modèle Kablix `moteur-dc` (pattes `1`, `2`) |
| `roue` | roue Ø 65 pour arbre TT | `moyeu` (selon X) | `diametre` | aucune |
| `engrenage` | roue dentée droite, module 1 | `moyeu` (selon Z, à mi-épaisseur) | `dents`, `epaisseur`, `alesage` | aucune |
| `aimant` | néodyme Ø 10 × 3, sud en bas | `pose` (centre de la face sud, selon Z) | — | modèle Kablix `aimant` |
| `palier` | roulement 608 | `alesage` | — | aucune |
| `chassis-2-roues` | plaque de 3 mm à découper au laser | `moteur-gauche`, `moteur-droit` (alignés, selon X), `roue-folle` | — | aucune |

Règles qui en découlent pour le document système :

- **Aimant** : son axe s'appelle `pose` (l'exemple du format ci-dessus le suit). Un autre nom → `axe-absent`.
- **Robot à roues** : les roues pivotent **sur le châssis** (axes `moteur-gauche`/`moteur-droit`), pas sur l'arbre du moteur, et les moteurs y sont encastrés. Le solveur l'exige : les deux roues d'un `roue-sol` ont le même parent de pivot, qui devient le châssis mobile. Le moteur n'est donc pas dans la chaîne cinématique de sa roue ; D6 les reliera par le rôle `roue:<repère du moteur>`.
- **Propriétés d'une pièce** : le document ne les porte pas encore (pas de champ `props` sur une pièce). Une roue y est prise à son diamètre par défaut ; le `rayon` d'un `roue-sol` et les `dentsA`/`dentsB` d'un `engrenage` se recopient à la main. À trancher avec l'éditeur du document (Kompix Editor) ou D6.
- **Formes calculées** : `roue` et `engrenage` n'ont pas de volume figé (`model3d.json`), il naît de leur `shape.mjs`. La vue 3D de Kablix (D6) devra lancer ce script, comme Kompix Editor.
- **Types partagés avec Kablix** : `servo`, `moteur-dc` et `aimant` portent le type des éléments intégrés. Comportement actuel du catalogue de Kablix (`partDef` de `catalog.mts`) : l'élément intégré passe avant un composant de bibliothèque du même type, qui est masqué sans avertissement. Pour le schéma, c'est le bon résultat (même simulation) ; pour la 3D, D6 devra aller chercher le volume dans le paquet tout en gardant l'élément intégré.

Champs inconnus (ici ou à la racine, comme l'état de l'éditeur) : ignorés à la lecture, **conservés** à l'enregistrement — Kablix regrave le document brut.

### Volume et axes d'une pièce dans Kablix (lot D6b)

Lecture côté extension : [src/systemeVolumes.ts](../src/systemeVolumes.ts) (paquets `.kompix` et maillages de `system/`) ; choix du volume et des axes côté webview : [src/webview/mecanique/volumes.mts](../src/webview/mecanique/volumes.mts). Banc : `npm run verify:volumes`.

| Pièce | Volume | Axes nommés |
| --- | --- | --- |
| `kompix`, paquet installé | `model3d.json` du paquet (ou le fichier désigné par `model3d` du manifeste) ; paquet à `shape` : le `model3d` rendu par `shape.mjs`, lancé avec les valeurs par défaut des propriétés | ceux de tous ses ensembles, le premier nom l'emporte (`modelAxes` de kompix-core) |
| `kompix`, pas de paquet | élément intégré de Kablix à volume (`araignee`, `patte` : assemblages de `assemblages.mts`) | idem |
| `fichier` | maillage `.stl`, `.glb` ou `.gltf` sous `system/` | aucun : la pièce ne peut porter ni pivot ni glissière (côté `b`) |

- **Priorité** : le paquet de bibliothèque passe TOUJOURS avant l'élément intégré du même type, contrairement au schéma (règle du lot D3 : `servo`, `moteur-dc`, `aimant`).
- **Miroir** (`pose.miroir: true`) : la pièce est le reflet de son volume par le plan X = 0 de son repère ; le point de chaque axe change de signe en X, sa direction (`x`/`y`/`z`, sans signe) est gardée. Le format ne disait pas l'axe du miroir : convention prise au lot D6b, **à confirmer par Frank**.
- **`shape.mjs`** : lancé dans `node:vm` comme dans Kompix Editor (contexte vide, pas d'`import`, délai d'une seconde). Une erreur ou un délai dépassé rend la pièce sans volume, sans bloquer le reste.
- **Pièce sans volume** (avertissement, la pièce reste dans le montage et dans le solveur) : `paquet-absent` (type ni dans la bibliothèque ni intégré à volume), `paquet-sans-volume` (paquet à plat, ou volume illisible), `fichier-absent` (maillage manquant ou d'un format inconnu).
- Les maillages joints aux pièces `mesh` d'un paquet suivent en base64 ; la vue 3D (D6c) les lira.

## Contrôles faits à l'ouverture dans Kablix

Un avertissement d'une ligne, sans bloquer l'ouverture, quand :

- le document est illisible ou vient d'une version plus récente ;
- une pièce désigne un repère absent du schéma (`ref-absente`), ou deux pièces le même repère (`ref-doublon`) — repère effectif, rôle compris ;
- un rôle est fautif (codes `role-*` de la convention de nommage) ;
- un fichier désigné manque sous `system/` (`fichier-absent`) ;
- une pièce ou une liaison est illisible, en double ou désigne une pièce absente (écartée de la lecture, gardée dans le fichier).

## Ce qui reste à faire

- Kompix Editor : écriture et relecture du document (`system.ts`, v2026.10.0.14) et solveur cinématique (`kinematics.ts`, v2026.10.0.15) faits ; animation du montage dans sa visionneuse, sur demande de Frank.
- Convention de nommage (D5) : faite (kompix-core v2026.10.0.16, Kablix v2026.11.5.338). Affichage du rôle dans la vue 3D de Kablix : avec D6.
- Bibliothèque mécanique (D3) : faite (Kompix Editor v2026.10.0.17), Béta, relue côté Kablix (v2026.11.5.340).
- Fabrication (D4) : faite (Kompix Editor v2026.10.0.18), relue côté Kablix (v2026.11.5.342). Sans effet sur le document système : elle lit les pièces extrudées (`poly`, `ep`) du volume d'un composant, pas `system.json`. Détail (formats, unités, sens, convention de trait laser à valider par Frank) : `docs/fabrication.md` de Kompix Editor. Une pièce maillée (STL importé, `.scad` compris) ne sort ni en contour laser ni dans le STL de l'ensemble. Suivant : D6 (vue 3D dans Kablix).
- Vue 3D dans Kablix (D6), découpée en cinq lots : D6a solveur, D6b volumes et axes des pièces, D6c vue fixe (three.js chargé à la demande), D6d pilotage par la simulation, D6e démonstrateurs et aide. D6a fait (v2026.11.5.343) : le solveur tourne dans la webview, `src/webview/mecanique/cinematique.mts`, copie de `kinematics.ts` de kompix-core dont seuls les imports changent ; `npm run verify:cinematique` tombe si la copie dérive et rejoue les tests de kompix-core contre elle. Correction du solveur : dans kompix-core d'abord, puis recopie. D6b fait (v2026.11.5.344) : volume et axes de chaque pièce, voir « Volume et axes d'une pièce dans Kablix » ; pas encore branché à un panneau (D6c).
- Solveur, défaut relevé au lot D6b sur le robot à deux roues : en conduite différentielle, la voie prise est l'écart des **points des axes du châssis** (`moteur-gauche`/`moteur-droit`, 90 mm), pas celui des roues (147 mm) : le robot tourne 1,6 fois trop vite. À corriger dans `rollStep` de kompix-core (point de contact = position de la roue le long de l'axe), puis recopier.
- Kablix : faire suivre un renommage de repère (`renommerRepere()` existe, pas encore branché à l'inspecteur).
