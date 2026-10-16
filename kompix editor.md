# Kompix Editor — plan

Sortir de Kablix tout ce qui sert à **fabriquer** un composant (2D et 3D) pour en faire une extension VS Code à part, puis, si ça tient, une application autonome. Kablix ne garde que ce qui sert à **poser et simuler**.

Ce fichier contient trois parties : **A** l'extraction (le plan de fond), **B** le choix de l'outil d'édition 3D, **C** le composant « qui contient tout » (cas du ruban de LED). B et C se décident avant de lancer A, parce qu'elles changent le contenu du format `.kompix`.

Rien n'est lancé. Les cases ⬜ sont à faire, les décisions à prendre sont marquées **DÉCISION**.

---

## État des lieux — ce qui existe aujourd'hui

| Fonction | Où ça vit | Dépend de |
| --- | --- | --- |
| Dessin 2D (externe + schéma interne, pastilles) | `Composants2D.svg`, lu par `scripts/_extract-composants.mjs` | Inkscape, Chrome headless (`getPointAtLength`) |
| Dessin 3D (profils, assemblages, poses) | `Composants3D.svg`, `_extract-profils.mjs`, `_extract-assemblage.mjs`, `montre.mjs` | Inkscape, Chrome headless |
| Moteur de volume | `src/webview/composants/iso3d.mts` (1359 lignes, projection isométrique maison, tri en profondeur) | rien (pur TypeScript) |
| Données de volume | `profils.mts`, `assemblages.mts` (fichiers **générés**, importés par les éléments) | générateurs ci-dessus |
| Créateur intégré (« + Créer un composant ») | `custom-part.mts`, `creator` de la webview, `verify-creator*.mjs` | Kablix entier |
| Paquet `.kompix` | `src/kompixLibrary.ts`, `componentManager.ts`, `zip.ts`, `scripts/build-kompix.mjs`, `build-components-index.mjs` | VS Code (partiellement) |
| Captures / fiches d'aide | `_capture-part.mjs`, `_capture-profil.mjs`, `docs/**/composants/*.md` | Chrome headless, éléments `kablix-*` |
| Tests de composant | `testkablix/_spec.mjs` + `_generate.mjs` | simulation Kablix |

Constat qui conditionne tout : **un composant intégré à Kablix et un `.kompix` sont deux mondes**. Le premier est du TypeScript (un élément Lit, une entrée de catalogue, un moteur). Le second est une archive de données (SVG + JSON + script `behavior.mjs` aveugle au dessin). Kompix Editor ne peut éditer que le second. Tout ce qui est « intégré » aujourd'hui (ruban de LED, araignée, transistors…) reste hors de portée tant que le format `.kompix` ne sait pas le dire. D'où la partie C.

---

# Partie A — Extraction : le plan

## A.1 Périmètre

**Part chez Kompix Editor**
1. Le créateur de composant (SVG, pastilles, pattes, rôles, propriétés, contrôle de simulation, `openDrain`, `l10n`).
2. Les deux planches (`Composants2D.svg` / `Composants3D.svg`) et leurs extracteurs.
3. L'édition 3D (partie B) : profils, assemblages, poses, aperçu qui tourne.
4. L'empaquetage `.kompix`, l'index de bibliothèque, les vignettes, les fiches d'aide, les captures.
5. La validation d'un paquet (`verify-kompix`, `verify-kompix-help`, `verify-kompix-signal`).

**Reste dans Kablix**
1. Le chargement et la pose d'un `.kompix` (`kompixLibrary.ts`, `custom-part.mts`).
2. Les moteurs de simulation (AVR, Pico, décodeurs).
3. Le gestionnaire de composants (téléchargement, mises à jour).
4. Le moteur de volume `iso3d.mts` **en lecture seule** (affichage), voir B.

**Zone grise — DÉCISION**
- Les composants **intégrés** au dépôt (éléments `kablix-*`). Option 1 : ils restent du code, Kompix Editor ne les touche pas. Option 2 : on les convertit un à un en `.kompix` procéduraux (partie C) pour que **tout** soit éditable. Recommandation : option 2, mais au fil de l'eau, en commençant par le ruban de LED.

## A.2 Architecture cible

Un dépôt unique à espaces de travail npm (pas de nouveau dépôt tant que le format bouge) :

```
packages/
  kompix-core/      format .kompix : lire, écrire, valider, versions, l10n. Sans VS Code, sans DOM.
  kompix-geometry/  lecture des contours SVG DANS la webview (remplace Chrome headless), profils, assemblages.
  kompix-3d/        moteur et outils 3D (partie B).
  kompix-sim-api/   contrat entre un paquet et le moteur : modèles de simulation nommés (partie C).
extensions/
  kablix/           l'extension actuelle, allégée.
  kompix-editor/    la nouvelle extension (éditeur personnalisé pour *.kompix + dossier de projet).
apps/
  kompix-editor-app/  (étape finale) coque autonome.
```

Principes :
1. **`kompix-core` est la seule porte du format.** Kablix et l'éditeur l'utilisent tous les deux, plus de copie de logique.
2. **Fin de la dépendance à Chrome headless.** Aujourd'hui `getPointAtLength` passe par un Chrome sans interface lancé par script. Dans une webview, l'API SVG est là gratuitement : la géométrie se calcule dans l'éditeur lui-même. Le Chrome headless reste utile seulement pour les captures et la CI.
3. **L'éditeur est un éditeur personnalisé VS Code** (`CustomEditorProvider`) sur `*.kompix` : ouvrir un paquet l'ouvre en mode édition, enregistrement = réécriture de l'archive. Les formats sources (`Composants2D.svg`…) restent importables.
4. **Prévisualisation = le vrai moteur de Kablix.** L'éditeur embarque les mêmes éléments et la même simulation en mode « banc » (une pièce, une broche pilotable, un traceur). Pas de second moteur à maintenir.

## A.3 Étapes

**Étape 0 — Préparer (sans rien déplacer)**
1. ⬜ Inventaire des imports : qui, dans `custom-part.mts`, `kompixLibrary.ts`, `componentManager.ts`, importe du Kablix « non format » ?
2. ⬜ Figer le format actuel : `kompixVersion` 1 + jeu de paquets de référence (`kablix_components/*.kompix`) comme tests d'or.
3. ⬜ Décider B et C (ci-dessous). Ils entrent dans `kompixVersion` 2.

**Étape 1 — `kompix-core`**
1. ⬜ Extraire lecture/écriture/validation de l'archive, `l10n`, `experimental`, versions calver.
2. ⬜ Kablix l'utilise à la place de son code actuel. Les `verify:kompix*` passent sans changement.

**Étape 2 — Éditeur 2D dans une webview**
1. ⬜ Ouvrir un `.kompix` : dessin, pattes, propriétés, aide, traductions en lecture.
2. ⬜ Poser/déplacer les pastilles sur la grille de 10 px, nommer les pattes (remplace le travail à la main dans Inkscape pour les cas simples). Inkscape reste l'outil de dessin : l'éditeur **ré-importe** le groupe à chaque enregistrement (surveillance de fichier).
3. ⬜ Aperçu en banc : pose la pièce, simule, trace.
4. ⬜ Enregistrer, reconstruire vignette et index, valider.

**Étape 3 — Éditeur 3D**
1. ⬜ Selon la partie B (cible : aperçu + poses + assemblage).
2. ⬜ Migrer `montre.mjs` (boucle « redessiner → recharger ») vers l'éditeur, en gardant la ligne de commande.

**Étape 4 — Bascule de Kablix**
1. ⬜ Retirer de Kablix le créateur intégré ; le bouton « + Créer un composant » ouvre Kompix Editor (commande `kompix.editor.open`), ou propose de l'installer s'il manque (`extensionDependencies` en suggestion, pas en obligation).
2. ⬜ `recommend.ts` / `announce.ts` : annoncer la séparation. Pas de changement de format utilisateur.

**Étape 5 — Application autonome (optionnelle)**
1. ⬜ Même webview, autre coque. Choix : **Tauri** (léger, Rust, webview système) ou **Electron** (lourd, Chromium embarqué donc comportement identique à VS Code). Pour un éditeur qui s'appuie sur la simulation de Kablix (WASM, workers), Electron est le plus sûr ; Tauri est plus léger mais le moteur web varie selon le système.
2. ⬜ Sans VS Code, il faut un remplaçant pour : système de fichiers, boîtes de dialogue, `l10n`, lancement de `arduino-cli` (seulement si on veut tester du code dans l'éditeur). Tout le reste est déjà de la webview.
3. **DÉCISION** : à ne lancer que si quelqu'un qui n'utilise pas VS Code en a besoin. Une extension suffit pour un public de développeurs.

## A.4 Risques

| Risque | Parade |
| --- | --- |
| Deux dépôts de vérité (planches Inkscape vs paquet) | Un seul sens : planche → paquet. L'éditeur ne réécrit jamais la planche |
| Régression du créateur actuel | `verify:creator*` convertis en tests d'or avant le déplacement |
| Dérive du moteur entre éditeur et Kablix | Le banc de l'éditeur **est** le moteur de Kablix, publié en paquet interne |
| Traductions | Règle inchangée : langue de base au fil de l'eau, le reste avant publication |
| Deux extensions à publier | Versions calver indépendantes ; `kompixVersion` négocie la compatibilité |

---

# Partie B — Outil d'édition 3D pour assemblages

## B.1 Besoin réel

Aujourd'hui un assemblage se fabrique ainsi : on dessine des pièces **à plat** dans Inkscape (plan de découpe), on écrit une **étiquette de pose** en texte (`flanc pos=28,0,0 ep=12 mat=servo miroir=x`), on lance `npm run montre`, on regarde, on retouche. Ça marche, mais :
1. La pose se **tape au clavier** : pas de poignée, pas d'aimantation, pas de mesure.
2. On ne **voit pas** les collisions ni les jeux.
3. Les pièces sont des **extrusions de contours** : pas de congés, pas de formes révolues, pas de pièces importées.
4. Le rendu est celui d'`iso3d.mts` seul : isométrique fixe, pas de vraie caméra libre.

Ce qu'il faut : **poser des pièces dans l'espace** (déplacer/tourner avec poignées, aimantation à la grille et aux axes nommés), **assembler** (emboîter deux axes — c'est déjà le vocabulaire du dépôt : `coxa`, `patella`, zéros confondus), **mesurer**, **exploser**, et **écrire** le même `assemblages.mts` qu'aujourd'hui.

## B.2 Les candidats

| # | Option | Licence | Effort | Ce qu'on gagne | Ce qu'on perd |
| --- | --- | --- | --- | --- | --- |
| 1 | **Statu quo amélioré** : Inkscape + `montre.mjs`, ajouter des poignées dans la fenêtre de la montre | MIT (maison) | faible | Rien à apprendre, déjà fonctionnel | Reste un outil de dessinateur, pas d'import 3D |
| 2 | **Éditeur maison sur three.js** : `ExtrudeGeometry` depuis les contours, `TransformControls` (poignées), aimantation, export vers `assemblages.mts` | three.js **MIT** | moyen | Colle exactement au modèle du dépôt, caméra libre, pièces importables (glTF/STL), compatible webview et appli autonome | Il faut l'écrire ; deux moteurs de rendu (iso3d + three) à garder alignés |
| 3 | **Éditeur officiel three.js** (`three.js/editor`) embarqué | MIT | moyen à fort | Interface toute faite (hiérarchie, matériaux, import/export) | Pensé pour des scènes et des jeux, pas des assemblages ; on en fait un fork lourd ; peu d'aide pour « emboîter deux axes » |
| 4 | **CAD navigateur Chili3D** (OpenCascade WASM + three.js, gestion d'assemblages) | **AGPL-3.0** (à confirmer dans le dépôt officiel) | fort | Vraie CAD, STEP/IGES | **Incompatible avec la licence MIT de Kablix** si on l'intègre ou le fork : l'ensemble devrait passer AGPL. À écarter pour l'intégration ; reste utilisable comme outil externe |
| 5 | **Code-CAD** : replicad (OpenCascade WASM), JSCAD, CadQuery, OpenSCAD | variables selon le projet (JSCAD et replicad : permissives, à confirmer ; OpenSCAD : GPL) | moyen à fort | Pièces paramétriques (le ruban de LED serait un script !) | Un langage de plus à apprendre ; OpenSCAD en GPL exige un processus séparé |
| 6 | **Outils externes** : FreeCAD (LGPL), Blender (GPL) → import **glTF / STL / STEP** | — | faible | Zéro code à maintenir, tout le monde peut y modéliser | Pas d'intégration, perte de la « pose en un geste » ; fichiers en plus à suivre |
| 7 | **Éditeur Babylon.js** | moteur Apache-2.0 ; licence de l'éditeur non confirmée | moyen | Outils de scène avancés | Même défaut que 3, licence floue |

Les licences ci-dessus viennent de recherches rapides : **à vérifier dans les dépôts officiels avant tout choix**, en particulier Chili3D, replicad et JSCAD.

## B.3 Recommandation

**Option 2 + import de l'option 6**, avec l'option 1 conservée comme repli.

1. **Éditeur maison sur three.js** : poignées, aimantation aux **axes nommés** (le concept existe déjà), explosion, coupe, mesure, collision simple (boîtes englobantes puis maillage).
2. **Les pièces entrent de trois façons** : contour SVG extrudé (l'existant), maillage importé (glTF/STL/OBJ), plus tard STEP via OpenCascade WASM chargé à la demande (LGPL, chargé comme bibliothèque séparée).
3. **Le dépôt reste la source de vérité** : l'éditeur lit et écrit les mêmes structures que `assemblages.mts` (`pieces`, `axes`, `pos`, `miroir`). Une pièce importée y entre sous forme de maillage simplifié.
4. **Rendu dans Kablix** : on garde `iso3d.mts` (léger, déjà branché sur la cinématique de l'araignée). Un **aperçu « rendu Kablix »** dans l'éditeur appelle ce moteur pour vérifier que ce qu'on pose est ce qui s'affichera. Si, plus tard, l'écart gêne, Kablix peut passer à three.js dans ses propres webviews — décision séparée, plus tard.
5. **Le code-CAD (option 5) pour les pièces paramétriques** viendra avec la partie C : un composant procédural peut très bien produire de la géométrie 3D à partir de ses paramètres.

## B.4 Lots

1. ⬜ **B1 — Visionneuse** : lire `assemblages.mts` / `profils.mts`, afficher en three.js, orbite libre, cacher/isoler/exploser. (Remplace la fenêtre de `montre.mjs`.)
2. ⬜ **B2 — Poses** : poignées déplacer/tourner/miroir, grille, aimantation aux axes, réécriture de l'étiquette de pose dans la planche **ou** dans le paquet (voir DÉCISION).
3. ⬜ **B3 — Assembler** : emboîter deux axes (zéros confondus), contraintes simples (coaxial, plaqué, distance), détection de collision.
4. ⬜ **B4 — Import** : glTF/STL, échelle et orientation, pièce « habillage » (comme l'image plaquée actuelle).
5. ⬜ **B5 — Aperçu Kablix** : bouton « voir comme dans Kablix » (moteur `iso3d`).
6. ⬜ **B6 — STEP** (facultatif) : OpenCascade WASM à la demande.

**DÉCISION** : où vit la pose ? (a) toujours dans la planche Inkscape (texte), l'éditeur réécrit le texte ; (b) dans le paquet `.kompix` (JSON), la planche devient une simple source de contours. Recommandation : **(b)** à terme, avec (a) conservé pour l'import. Une pose en JSON se manipule à la souris sans toucher un fichier Inkscape.

---

# Partie C — Un composant qui contient tout (cas du ruban de LED)

## C.1 Pourquoi le ruban de LED ne tient pas dans un `.kompix` aujourd'hui

J'avais dit que ce n'était pas possible « en indépendant ». Voici précisément pourquoi, d'après le code :

1. **Dessin statique.** Un `.kompix` embarque un `schema.svg` fixe. Le ruban de LED calcule sa **spirale** et ses **pastilles** en fonction du nombre de LED (`stripGeometry()`, [led-strip-element.mts](src/webview/composants/led-strip-element.mts)). Un SVG figé ne peut pas dire « 10 LED » puis « 300 LED ».
2. **Propriétés numériques seulement.** `params` du manifeste ne connaît que des nombres à valeur par défaut. Le ruban a un **choix de protocole** (WS2811 / WS2812 / APA102 / WS2801) et un **ordre des couleurs** : des énumérations, qui changent en plus **le nombre et le nom des broches** (3 ou 4).
3. **Broches variables.** Le manifeste fixe `pins` une fois pour toutes. Ici les broches dépendent d'une propriété.
4. **Simulation hors de portée.** `behavior.mjs` ne voit que `readPin` / `writePin` (niveaux logiques, sans date). Décoder un NeoPixel exige de **mesurer des durées d'impulsion** (T0H/T1H, pause de 300 µs) ; un APA102/WS2801 est un esclave du **bus SPI matériel** (`spi-led-strip.mts`). Ces décodeurs vivent dans les moteurs (`ws2812.mts`, `engines/avr.mts`, `engines/pico.mts`) et alimentent le canal `neopixel`.
5. **Couleur des LED en retour.** Les LED allumées doivent se **redessiner** à chaque image avec la couleur décodée. `behavior.mjs` n'a aucune API pour dessiner.
6. **Position stable de la connectique.** L'éditeur recale la pièce (`stripShift`, [editor.mts](src/webview/diagram/editor.mts)) quand le nombre de LED change pour que les broches ne bougent pas. Code propre à ce composant dans l'éditeur.
7. **Liens dans le modèle.** `neopixelCount` et `neopixelBindings` ([model.mts](src/webview/diagram/model.mts)) connaissent le type `led-strip` en dur.

Donc : ce n'est pas impossible, c'est que le format n'a **pas encore les 6 capacités** qu'il faut. Les voici.

## C.2 Les capacités à ajouter au format (kompixVersion 2)

| # | Capacité | Forme dans le paquet | Remplace dans Kablix |
| --- | --- | --- | --- |
| 1 | **Propriétés typées** : `int` (min/max), `number`, `enum` (liste de choix traduisibles), `string`, `bool`, ordre d'affichage, dépendances | `params[]` enrichi (`type`, `min`, `max`, `choices`, `showIf`) | `props` codés en dur dans le catalogue |
| 2 | **Forme procédurale** : une fonction pure `(propriétés) → { largeur, hauteur, svg, broches }` | fichier `shape.mjs` (module ES, synchrone, sans accès réseau) | `stripGeometry()` et les éléments Lit |
| 3 | **Broches calculées** : noms, positions sur la grille, rôles, tout vient de la forme | `broches` renvoyées par `shape.mjs` | `stripPinNames()` |
| 4 | **Point d'ancrage** : une broche (ou un point) qui ne doit pas bouger quand la forme change | `anchor: "GND"` dans le manifeste | `stripShift()` dans `editor.mts` |
| 5 | **Modèles de simulation nommés** : le paquet **déclare** quel décodeur du moteur il utilise et avec quels paramètres | `sim: { model: "led-chain", count: "$leds", protocol: "$protocol", order: "$colorOrder" }` | `neopixelCount`, `neopixelBindings`, entrée `kind: 'neopixel'` |
| 6 | **Retour visuel** : la forme reçoit l'état de la simulation et se redessine | `render(propriétés, état) → mises à jour` appelé à chaque image | rendu des LED dans l'élément |

### Pourquoi « modèle nommé » pour la simulation (capacité 5)

Deux voies possibles :

- **Voie 1 — catalogue de modèles du moteur** : le moteur fournit `led-chain`, `servo`, `dc-motor`, `i2c-device`, `spi-slave`… Le paquet les **nomme** et les paramètre. Le code de simulation reste dans Kablix (testé, rapide, dans le worker du Pico). Sûr, rapide, mais limité à ce que le moteur sait faire.
- **Voie 2 — API riche pour `behavior.mjs`** : fronts horodatés (`onEdge(pin, cb(date, niveau))`), bus I²C/SPI esclaves, `setPixel(i, rgb)`, etc. Puissant, mais doit rester **synchrone**, **rapide** (la simulation du Pico est déjà à 6 % de marge) et **sûr** (un script distant s'exécute chez l'utilisateur ; le modèle de confiance actuel est par empreinte SHA256).

**Recommandation : voie 1 d'abord**, car le ruban de LED, l'anneau, la matrice et le DMX se ramènent tous à des modèles que le moteur sait déjà faire. La voie 2 s'ajoute ensuite, par morceaux, pour les cas qui ne rentrent pas dans un modèle.

## C.3 Format du ruban de LED en `.kompix` v2 (esquisse)

```
led-strip.kompix
├─ manifest.json     identité, params typés, sim, anchor, l10n
├─ shape.mjs         spirale + broches (la logique de stripGeometry)
├─ render.mjs        (facultatif) dessin des LED selon l'état décodé
├─ help/fr.md …
└─ thumbnail.webp
```

```json
{
  "kompixVersion": 2,
  "type": "led-strip",
  "experimental": true,
  "params": [
    { "name": "leds", "type": "int", "min": 1, "value": 10, "label": "LEDs" },
    { "name": "protocol", "type": "enum", "value": "ws2812",
      "choices": ["ws2811", "ws2812", "apa102", "ws2801"], "label": "Protocol" },
    { "name": "colorOrder", "type": "enum", "value": "rgb",
      "choices": ["rgb", "brg", "grb"], "showIf": "protocol == 'ws2801'" }
  ],
  "anchor": "GND",
  "shape": "shape.mjs",
  "sim": { "model": "led-chain", "count": "$leds", "protocol": "$protocol", "order": "$colorOrder" }
}
```

## C.4 Impact sur Kablix

1. **Le chargeur de paquet** ([kompixLibrary.ts](src/kompixLibrary.ts), [custom-part.mts](src/webview/composants/custom-part.mts)) apprend : propriétés typées, `shape.mjs`, `anchor`, `sim`.
2. **`custom-part.mts` ne contient plus de cas particulier** : `rebuildsStrip`, `stripShift`, `neopixelCount`… deviennent génériques (« une propriété qui change la forme → re-rendu + recalage sur l'ancre »).
3. **Les décodeurs** (`ws2812.mts`, `spi-led-strip.mts`) deviennent des modèles enregistrés sous un nom ; plus de test `type === 'led-strip'` dans le modèle.
4. **Compatibilité** : un paquet v1 se charge comme avant. `kompixVersion` est vérifié ; un paquet v2 sur un vieux Kablix est refusé proprement avec un message « mettre à jour Kablix ».
5. **Exécution de `shape.mjs`** : même modèle de confiance que `behavior.mjs` (avertissement à la première utilisation, empreinte SHA256), exécuté dans un contexte sans réseau. Pour la forme, un temps d'exécution borné suffit (fonction pure appelée à chaque changement de propriété, pas à chaque image).

## C.5 Lots

1. ⬜ **C1 — Propriétés typées** (entier, énumération, `showIf`) dans le manifeste, l'inspecteur et le créateur. Livrable seul : utile à tous les composants de bibliothèque.
2. ⬜ **C2 — Forme procédurale** : `shape.mjs` + broches calculées + ancre. Banc de test : mêmes pastilles pour 1 et 300 LED (le banc `verify:ledstrip` existe déjà, à réutiliser).
3. ⬜ **C3 — Modèles de simulation nommés** : extraire `led-chain` du code de `led-strip` ; `sim.model` dans le manifeste.
4. ⬜ **C4 — Retour visuel** : `render` ou, plus simple, couleurs LED fournies par le moteur à la forme.
5. ⬜ **C5 — Convertir le ruban de LED** en `kablix_components/led-strip.kompix` ; retirer l'élément intégré une fois les `testkablix` (uno/pico/pico2, WS2812, APA102, WS2801) verts à l'identique. **Contre-épreuve** : mêmes tests avant/après.
6. ⬜ **C6 — Autres candidats** : anneau de LED, matrice NeoPixel, afficheur à N chiffres, LCD à taille variable (tous « forme calculée + modèle nommé »).

## C.6 Ce que ça change pour Kompix Editor

Le même format fait le pont : l'éditeur de la partie A édite **aussi** les composants procéduraux (propriétés typées, `shape.mjs` avec aperçu en direct, pastilles calculées visibles, banc de simulation). Les composants 3D paramétriques (B.3 point 5) sont la même idée avec une forme en volume.

---

# Ordre proposé

| Rang | Lot | Pourquoi d'abord |
| --- | --- | --- |
| 1 | **C1** propriétés typées | Utile tout de suite, risque nul, prépare le format |
| 2 | **C2 + C3** forme procédurale + modèles nommés | Débloque le ruban de LED sans l'éditeur |
| 3 | **C5** conversion du ruban de LED | Preuve que le format suffit ; tests existants servent de filet |
| 4 | **A étapes 0-1** (`kompix-core`) | Fige le format v2 avant de bâtir dessus |
| 5 | **A étape 2** éditeur 2D | Valeur directe pour Frank |
| 6 | **B1-B3** éditeur 3D | Après la visionneuse, on sait si l'option 2 tient |
| 7 | **A étapes 4-5** bascule + appli | Seulement si 1-6 sont solides |

## Décisions attendues de Frank

1. **A.1** : les composants intégrés se convertissent-ils en `.kompix` procéduraux, au fil de l'eau ?
2. **B.3** : option 2 (three.js maison) + import glTF/STL, confirmée ?
3. **B.4** : pose en JSON dans le paquet (recommandé) ou texte dans la planche ?
4. **C.2** : simulation par modèles nommés d'abord (recommandé) ou API riche tout de suite ?
5. **A.3 étape 5** : l'application autonome est-elle un vrai besoin ?

Sources de la recherche d'outils : [Chili3D](https://github.com/wbste/chili3d) · [licence de l'éditeur three.js](https://discourse.threejs.org/t/license-to-use-three-js-editor-code/31284) · [licence de Babylon.js](https://forum.babylonjs.com/t/the-babylon-js-license-and-the-future-of-babylon-js/36938)
