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

Codes rendus par le solveur (`{ code, target }`, `target` = id de la liaison) : `boucle-fermee`, `axe-absent`, `engrenage-sans-pivot`, `parametre-invalide` (engrenage sans `rapport` non nul ni `dentsA`/`dentsB` positifs), `couplage-cycle` (engrenages en cycle, ou pivot mené par deux engrenages), `roue-sans-rayon`, `roue-sans-pivot` (roue qui n'est pas l'enfant d'un pivot accepté), `roues-incompatibles` (plus de deux roues, châssis différents, axes non confondus, ou voie nulle), `type-inconnu` (liaison d'un type futur, ignorée sans erreur) ; `variable-menee` est rendu par `solve`, pas à la construction. Un axe nommé sans direction est pris selon Z. La pose monde d'une pièce quelconque peut être imposée (`base`, le châssis qui roule) : sa liaison parente est alors ignorée. Détail de l'API : `docs/cinematique.md` de Kompix Editor (v2026.10.0.15).

### Convention de nommage (lot D5)

Le nom d'une pièce lui donne un **rôle de simulation** (décision de Frank du 20/11/2026 : `rôle:repère`). Il sert surtout quand seul le nom existe : pièce maillée, arbre d'un assemblage STEP importé (lot D8). Une pièce sans rôle reste **inerte** (structure, décor) : elle bouge avec ses liaisons, la simulation ne la pilote pas et ne la lit pas.

**Syntaxe** : `<rôle>:<repère>`, coupé au PREMIER `:` ; espaces de tête et de fin retirés de chaque côté. Le rôle se compare sans tenir compte de la casse (`Servo:Act1` = `servo:Act1`) ; le repère garde la sienne (`Act1`, comme dans le schéma). Un nom sans `:` n'a pas de rôle, sauf `sol` (seul rôle sans repère). Les suffixes que les logiciels de CAO ajoutent aux noms (`servo:Act1 (1)`, `<1>`, `.001`) ne sont pas reconnus en v1 : ils se traiteront avec l'import STEP (D8).

| Rôle | Le repère désigne | Types de composant acceptés | Ce que la simulation en fera |
| --- | --- | --- | --- |
| `servo` | le composant lui-même | `servo` | angle simulé → variable du pivot dont la pièce est le parent (D6) |
| `moteur` | le composant lui-même | `moteur-dc` | vitesse simulée → variable du pivot dont la pièce est le parent (D6) |
| `aimant` | le composant lui-même | `aimant` | position lue par les capteurs à effet Hall (D7) |
| `hall` | le composant lui-même | `hall` | lit la distance aux aimants (D7) |
| `ultrason` | le composant lui-même | `hcsr04` | lance un rayon depuis son axe `faisceau` jusqu'au premier obstacle (D7b) |
| `roue` | le moteur ou le servo qui l'entraîne | `moteur-dc`, `servo` | tourne avec son moteur ; avec une liaison `roue-sol`, fait rouler le châssis (D6) |
| `sol` | aucun (nom exactement `sol`) | — | plan Z = 0, côté `b` des liaisons `roue-sol` |

Rôles **propres** (`servo`, `moteur`, `aimant`, `hall`, `ultrason`) : le repère est celui de la pièce elle-même. Il tient lieu de `ref` quand `ref` est absent (repère effectif) ; si les deux sont donnés et diffèrent, `ref` l'emporte. Rôles **entraînés** (`roue`) : le repère désigne un AUTRE composant ; la pièce, purement mécanique, n'a pas de `ref` et plusieurs pièces peuvent porter le même nom (deux roues sur `M2`). Le fin de course (D7c) ajoutera son rôle à ce tableau le moment venu.

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
| `fichier` | maillage `.stl`, `.glb` ou `.gltf` sous `system/`, dans SES coordonnées : le repère de la pièce est celui du fichier, jamais recentré (v2026.11.5.355 ; avant, la vue 3D le ramenait au centre de sa boîte) | aucun : la pièce ne peut porter ni pivot ni glissière (côté `b`) |

- **Priorité** : le paquet de bibliothèque passe TOUJOURS avant l'élément intégré du même type, contrairement au schéma (règle du lot D3 : `servo`, `moteur-dc`, `aimant`).
- **Miroir** (`pose.miroir: true`) : la pièce est le reflet de son volume par le plan X = 0 de son repère ; le point de chaque axe change de signe en X, sa direction (`x`/`y`/`z`, sans signe) est gardée. Le format ne disait pas l'axe du miroir : convention prise au lot D6b, **à confirmer par Frank**.
- **`shape.mjs`** : lancé dans `node:vm` comme dans Kompix Editor (contexte vide, pas d'`import`, délai d'une seconde). Une erreur ou un délai dépassé rend la pièce sans volume, sans bloquer le reste.
- **Pièce sans volume** (avertissement, la pièce reste dans le montage et dans le solveur) : `paquet-absent` (type ni dans la bibliothèque ni intégré à volume), `paquet-sans-volume` (paquet à plat, ou volume illisible), `fichier-absent` (maillage manquant ou d'un format inconnu).
- Les maillages joints aux pièces `mesh` d'un paquet suivent en base64 ; la vue 3D (D6c) les lira.

### Import d'un assemblage STEP (lot D8a)

Conversion faite par `stepToSystem` de kompix-core (`step.ts`, Kompix Editor v2026.10.0.21, relue en Kablix v2026.11.5.354) ; détail : `docs/step.md` de Kompix Editor. Le STEP est lu par `occt-import-js` 0.0.23 (OpenCascade en WASM, LGPL-2.1), unités ramenées au millimètre par la lecture. Le document produit est un document système ordinaire : Kablix le lit sans rien savoir du STEP.

- **Pièces** : une pièce `fichier` par nœud de l'arbre qui porte des maillages, ses maillages fusionnés en un STL binaire `system/meshes/<id>.stl`. Un rôle reconnu sur un nœud (`servo:S1`) fusionne toute sa sous-arborescence en une pièce. OpenCascade aplatit un sous-assemblage de solides en un seul nœud : un maillage à rôle dans un nœud sans rôle fait donc sa propre pièce, les autres restent fusionnés au nom du nœud.
- **Nom, id, repère** : `nom` = nom du nœud (sinon du premier maillage, sinon `piece-<n>`), gardé tel quel ; `id` = nom en minuscules sans accents, hors `[a-z0-9-]` → `-` (`servo:S1` → `servo-s1`), unicité par `-2`, `-3`… ; `ref` = repère des rôles propres seulement (servo, moteur, aimant, hall, ultrason).
- **Pose** : sommets laissés en coordonnées globales du STEP (transformations d'assemblage déjà appliquées par la lecture), pose nulle. Option `recentrer` : maillage ramené au centre de sa boîte, ce centre dans `pose.pos`.
- **Liaisons** : aucune (le STEP n'en porte pas), `liaisons: []`. Les pièces `fichier` n'ayant pas d'axe nommé, un montage importé ne peut porter ni pivot ni glissière côté `b` tant qu'on n'y ajoute pas des pièces de bibliothèque : la vue 3D de Kablix le montre fixe.
- **Couleur** : celle du nœud ou du premier maillage coloré, dans `extra.couleur` (`#rrggbb`), champ inconnu du format donc conservé. Kablix la lit (`couleur` de la pièce lue, `#rrggbb` seulement, mis en minuscules) et la vue 3D l'applique aux pièces `fichier` dont le maillage n'a pas de couleurs de sommets (v2026.11.5.355).
- **Problèmes** de conversion : `step-echec`, `step-vide`, `maillage-invalide` (pièce écartée), plus ceux de `checkRoles` relayés.
- Règles prises sans Frank, **à confirmer** (point 50 du `todo.md` de Kompix Editor).

### Commande d'import (lot D8b)

Kompix Editor v2026.10.0.22, relu en Kablix v2026.11.5.355 ; détail : section « Téléchargement et commande » de `docs/step.md` de Kompix Editor.

- **OpenCascade à la demande** : `occt-import-js` 0.0.23 n'est pas dans le `.vsix`. Au premier import, accord demandé (fenêtre modale, environ 7 Mo), puis téléchargement depuis jsDelivr (repli unpkg sur erreur réseau ou HTTP), empreinte SHA-256 de chaque fichier vérifiée en mémoire avant écriture, cache dans `globalStorage/occt/0.0.23/`, revérifié avant chaque chargement.
- **Commande** « Importer un assemblage STEP… » (`kompixEditor.importStep`, palette et clic droit sur un `.step`/`.stp`) : le STEP, puis un `.projix` EXISTANT (pas de création de projet), confirmation s'il porte déjà un montage, conversion sans `recentrer`, `system.json` + `system/` écrits par `writeProjixSystem` (autres entrées identiques à l'octet). `step-echec`/`step-vide` : rien n'est écrit ; autres problèmes : import fait, liste dans le canal de sortie « Kompix ».
- Choix pris sans Frank, **à confirmer** (point 54 du `todo.md` de Kompix Editor).

### Montage importé dans la vue 3D (lot D8c)

Kablix v2026.11.5.355. Démonstrateur `docs/exemples/mecanique/robot-step/` fabriqué par `scripts/_exemple-step.mjs` avec le VRAI code de Kompix Editor (`stepToSystem` et `occt-import-js` pris dans son dépôt, appel identique à la commande d'import), STEP d'origine joint. `verify:vue3d` (étage G) contrôle que chaque pièce de la vue occupe la boîte de son STL (le recentrage des pièces `fichier`, défaut relevé à ce lot, les empilait à l'origine), les rôles, la lecture du Hall entre deux pièces importées et la couleur ; `verify:exemples-meca` lit le projet contre son schéma.

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
- Vue 3D dans Kablix (D6), découpée en cinq lots : D6a solveur, D6b volumes et axes des pièces, D6c vue fixe (three.js chargé à la demande), D6d pilotage par la simulation, D6e démonstrateurs et aide. D6a fait (v2026.11.5.343) : le solveur tourne dans la webview, `src/webview/mecanique/cinematique.mts`, copie de `kinematics.ts` de kompix-core dont seuls les imports changent ; `npm run verify:cinematique` tombe si la copie dérive et rejoue les tests de kompix-core contre elle. Correction du solveur : dans kompix-core d'abord, puis recopie. D6b fait (v2026.11.5.344) : volume et axes de chaque pièce, voir « Volume et axes d'une pièce dans Kablix » ; pas encore branché à un panneau (D6c). D6c fait (v2026.11.5.347) : bouton « 3D » de la barre, visible quand le projet a un `system.json` ; panneau flottant dans la page de l’atelier ; three.js 0.186.1 dans un paquet à part (`dist/vue3d.js`) chargé au premier clic par une balise à nonce. L’extension relit le document à chaque ouverture, le contrôle contre le schéma courant envoyé par la page et joint les volumes (`vue3d`). La vue pose le montage à la pose du document (solveur, chaque variable à son `zero`), caméra orbitale (Z en haut), bulle au survol (nom, rôle, repère, défauts) ; pièce en défaut rouge et encadrée : problèmes du document rangés par ID, repère, chemin ou liaison (les deux pièces), problèmes de volume, problèmes du solveur (enfant de la liaison), maillage illisible. Pièce sans volume : boîte rouge de 20 mm en fil de fer. `modele3d.mts` et `montage3d.mts` sont des copies de `model3d.ts` et `montage.ts` de kompix-core ; `npm run verify:vue3d` les compare et joue la vue en Chrome headless à la vraie souris. D6d fait (v2026.11.5.348) : voir « Pilotage par la simulation ».
- Pilotage par la simulation (lot D6d, [src/webview/mecanique/pilotage.mts](../src/webview/mecanique/pilotage.mts), pur) : à chaque image de rendu, la page donne l'angle de chaque servo (celui de son élément, PCA9685 compris) et la vitesse de chaque moteur (fraction du nominal de `motorStates`, 0 s'il a grillé), par repère du schéma, et le temps écoulé (temps simulé quand le moteur le donne, borné à 0,25 s). Pièce `servo:<R>` : chaque pivot dont elle est le parent prend l'angle du servo R, en degrés absolus. Pièce `moteur:<R>` : chaque pivot dont elle est le parent tourne à la vitesse de R × **200 tr/min** (motoréducteur TT sous 5 V ; régime choisi sans Frank, **à confirmer**), intégrée en angle à partir du `zero`. Pièce `roue:<R>` : le pivot qui la porte suit R (vitesse intégrée pour un moteur, angle pour un servo). Un pivot mené par un engrenage n'est jamais commandé ; un pivot visé deux fois garde la première commande. Roues sur le sol : la rotation de chaque pivot depuis l'image précédente (bornes appliquées) va à `rollStep`, le châssis roule. Pièce en défaut de rôle (`role-*` sauf `role-ref-different`, `ref-absente`) : inerte. Butées (`saturated`), problèmes du solveur et commandes dont le repère n'est ni un servo ni un moteur du schéma : encart au bas de la vue. Arrêt de la simulation : retour à la pose du document. Le moteur à courant continu n'a pas de sens de rotation dans la simulation : il tourne toujours dans le sens positif de son pivot.
- Solveur, défaut relevé au lot D6b et corrigé (kompix-core v2026.10.0.19, recopié en Kablix v2026.11.5.346) : en conduite différentielle, la voie était l'écart des **points des axes du châssis** (`moteur-gauche`/`moteur-droit`, 90 mm) au lieu de celui des roues (147 mm), d'où un virage 1,6 fois trop rapide. Désormais, le point de contact d'une roue = l'origine de la pièce roue, à sa pose du document, projetée sur l'axe de son pivot ; deux roues au même point de contact (voie nulle) → `roues-incompatibles`. `verify:volumes` contrôle le virage du robot deux roues sur 147 mm.
- Capteurs lus dans la scène (D7), découpé en trois lots : D7a effet Hall, D7b HC-SR04 (rayon), D7c fin de course (contact). D7a fait (v2026.11.5.350, [src/webview/mecanique/capteurs.mts](../src/webview/mecanique/capteurs.mts), pur) : à chaque image de simulation, la vue 3D mesure la boîte englobante, alignée sur les axes du monde, de chaque pièce `hall:<R>` et `aimant:<R>` ; la lecture du capteur R est l'écart (plus courte distance, 0 si elles se touchent) entre sa boîte et celle de l'aimant le plus proche, `Infinity` sans aimant. La page compare cet écart au seuil du capteur du schéma (propriété `trigger`, 10 mm par défaut, comme en 2D au lot D0). Une pièce `hall:` dans le montage donne la main à la scène pour ce repère, tant que la vue est ouverte : l'aimant de la feuille et l'aimant glissant ne comptent plus ; vue fermée, retour à la feuille. Un seul capteur par repère (la première pièce) ; pièce en défaut de rôle : inerte. Règle de l'écart des boîtes choisie sans Frank, **à confirmer** (boîte alignée sur le monde : une pièce tournée de 45° grossit). Paquet `hall` ajouté à la bibliothèque mécanique par Kompix Editor v2026.10.0.20 (TO-92 aplati 4,5 × 3,5 × 1,6 mm, pattes non modélisées pour ne pas grossir la boîte). D7b fait (Kompix Editor v2026.10.0.20 : rôle `ultrason`, paquet `hcsr04` ; Kablix v2026.11.5.352) : la pièce `ultrason:<R>` lance, à chaque image, un rayon depuis le point de son axe nommé `faisceau`, dans le sens POSITIF de sa direction (`z` par défaut), pris dans le modèle NON reflété puis porté par la matrice monde de la pièce (miroir compris) ; la lecture est la distance (cm) au premier maillage touché d'une AUTRE pièce, sol compris, `Infinity` sans obstacle. Pièce sans axe `faisceau` (paquet absent, autre modèle) : non lue. La page borne la distance à la plage du capteur du schéma (`distancemin`/`distancemax`, borne haute sans obstacle, arrondi au mm) et la pose sur le curseur du composant, avec son événement `input` : le moteur la reçoit comme un réglage à la main. Vue fermée, la dernière distance reste. Choix faits sans Frank, **à confirmer** : sens du rayon (le format n'a pas d'axe signé), rayon unique sans cône de 15°, borne haute sans obstacle (un vrai HC-SR04 renvoie une impulsion d'écho très longue). Modèles de simulation `hcsr04` et `hall` de kompix-core (`sim.model`, pattes de rôle VCC/TRIG/ECHO/GND et V+/GND/S) : désignent les éléments de Kablix, sans effet sur le document système.
- Import STEP (D8), découpé en trois lots, tous faits : D8a conversion (voir « Import d'un assemblage STEP »), D8b téléchargement du WASM à la demande et commande d'import dans Kompix Editor (« Commande d'import »), D8c démonstrateur et banc dans la vue 3D de Kablix (« Montage importé dans la vue 3D »).
- Composants électroniques en 3D (D9, lot C6 de Kompix Editor) : un composant par lot, paquets `.kompix` Béta, sans rôle mécanique ; ils ne touchent pas `system.json`. Leur simulation passe par un modèle nommé du bloc `sim` du paquet (`SIM_MODELS` de `kompix-core/src/sim.ts`), qui décrit ce que fait déjà l'élément de Kablix : `led-chain`, `7segment`, `lcd`, `led-bar`, `ssd1306`, `ili9341`, `dht`, `pir` et, depuis Kompix Editor v2026.10.0.33, `ao-do-sensor` (famille flamme, gaz, son, lumière : champ `sensitivity` nombre ou `"$sensitivity"`, pattes `aout`/`dout` réglables, `AOUT`/`DOUT` par défaut ; AOUT baisse quand l'intensité monte, DOUT actif bas, détection si intensité > sensibilité), depuis v2026.10.0.37 `ntc-temp` (pattes fixes GND/VCC/OUT, constantes de l'élément NTC : R0 10 kΩ, T0 298,15 K, B 3950 K, Rsérie 10 kΩ, −55 à +125 °C ; température au curseur de Kablix, aucun champ) et depuis v2026.10.0.38 `heartbeat` (pattes fixes GND/VCC/OUT, courbe PPG de `pulseWaveform` d'`analog-waves.mts` : base 0,6, amplitude 0,15, gaussiennes 0,16 et 0,42 de largeur 0,1, onde dicrotique × 0,35, ligne plate 0,08 à 0 bpm, bpm borné à 0..200, horloge réelle ; bpm au curseur de Kablix, aucun champ) et depuis v2026.10.0.39 `tilt` (pattes fixes GND/VCC/OUT, sortie logique sur OUT active à l'état haut : 1 incliné, 0 à plat ; inclinaison à la souris dans Kablix, `el.tilted`, aucun champ). Nouveau type de champ `number` (nombre fini, zéro admis) à côté de `int` (entier ≥ 1) et `string`. Kablix ne lit pas encore ces paquets à la place de ses éléments : remplacement sur demande de Frank seulement.
- Kablix : faire suivre un renommage de repère (`renommerRepere()` existe, pas encore branché à l'inspecteur).
