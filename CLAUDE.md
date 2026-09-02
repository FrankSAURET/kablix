# Kablix — extension VS Code de simulation Arduino/Pico

Éditeur de câblage (webview Lit) + simulation AVR (avr8js : uno/mega) et MicroPython (RP2040). TypeScript strict, modules `.mts`, esbuild.

## Commandes
- Build : `npm run build` · typecheck : `npm run typecheck`
- Tests : `npm run verify:all` (ciblés : `verify:diagram`, `verify:components`, `verify:micropython`…)
- Paquet : `npm run package` → `.vsix` (vsce, --no-dependencies)

## Architecture
- `src/webview/composants/` : forks des éléments @wokwi v1.9.2 (balises `kablix-*`, lit direct, SANS décorateurs — `static properties` + `declare`). Retoucher un composant = modifier SON fork (modèle : `slide-potentiometer-element.mts`). Plus d'overlay, plus de pin-overrides.
- `src/webview/diagram/editor.mts` : éditeur canvas (grille 10 px, autoroutage A*).
- `src/webview/engines/` : `avr.mts` (uno/mega), MicroPython.
- `svg retouche/` : SVG retouchés à la main par Frank (Inkscape) ; `svg retouche/Validé/` = archive des intégrés.

## Source des dessins : deux planches Inkscape (depuis v2026.8.36)
Frank dessine TOUT dans deux planches A3 à la racine :
- **`Composants2D.svg`** : les composants PLATS de la bibliothèque (dessin externe + schéma interne). Lu par `_extract-composants.mjs`.
- **`Composants3D.svg`** : les pièces à mettre EN VOLUME (profils, assemblages, robot araignée). Lu par `_extract-profils.mjs`, `_extract-assemblage.mjs`, `montre.mjs`.

`Composants.svg` = l'ancienne planche unique (avant v2026.8.36), gardée en repli automatique : `planche('2D'|'3D')` dans `scripts/_lire-contours.mjs` prend la nouvelle planche si elle existe, l'ancienne sinon. `--source=` force un autre fichier. Règles (planche 2D) :
- Un composant = un groupe dont l'**id est le nom du composant** (`diode`). Son schéma interne = groupe `<nom>-interne` (`diode-interne`). Groupe interne absent = pas de vue interne.
- **Mêmes pattes** pour le dessin externe et le schéma interne (mêmes noms, même ordre).
- Les **pastilles rouges** portent le **nom de la patte** (texte au-dessus) et leur CENTRE est le point de connexion des fils. `nc` = non connecté.
- **Ne créer QUE les composants que Frank nomme** : les planches contiennent aussi ses dessins en cours (`ic14`, `to92`…), à ignorer.
- **Simulation précisée au cas par cas** par Frank — ne rien inventer.
- Noms de pattes, propriétés et outils de simulation (curseurs, aide…) sont **traduisibles** : la chaîne de base (EN, dans le code) est écrite au fil de l'eau, `l10n/bundle.l10n.fr.json` **attend la publication** (voir Traductions).
- Tout nouveau composant : **tests `testkablix`** obligatoires — un test Arduino (`<type>-uno`) ET un test Pico (`<type>-pico`), via `_spec.mjs` + `node testkablix/_generate.mjs` (jamais à la main), plus la ligne dans `testkablix/README.md`.
- **Schéma de test déjà retouché par Frank : garder les emplacements des composants** (`x`/`y` de `_spec.mjs`). Retoucher ou refaire un test ne doit pas redisposer la planche — sauf à la refaire entièrement et différemment. `_generate.mjs` écrase tout : relire la spec avant, et ne régénérer que les fichiers du lot.
- Tout nouveau composant : **fiche d'aide obligatoire** en **FR** (`docs/fr/composants/<type>.md`), avec son illustration `docs/img/composants/<type>.webp` produite par `node scripts/_capture-part.mjs <type>` (jamais une capture d'écran à la main). La version EN (`docs/en/…`) **attend la publication** (voir Traductions) ; `npm run verify:docs` compte les fiches et signalera le manque — c'est normal.

### Boîtiers partagés (TO-92 et suivants)
Un **boîtier** (`to92`…) sert à des dizaines de composants : c'est un DESSIN, pas un composant.
- Le dessin externe du boîtier vit dans `src/webview/composants/externe/<boîtier>.svg`, et l'élément qui l'utilise l'habille : Frank dit **quoi écrire dessus** (attribut `text`, une ligne par saut de ligne), donne le **schéma interne** (`NPN1`, `PNP1`…) et les **paramètres de simulation**.
- L'élément expose donc `pkg` (choix du boîtier — d'autres viendront) et le symbole interne : ajouter un boîtier = une entrée dans `PACKAGES` (`transistor-element.mts` = modèle), pas un nouvel élément.
- Un schéma interne **resservira** à d'autres composants : le garder générique (pattes numérotées 1/2/3 côté prototype, nommées côté référence figée).
- Deux niveaux de composant : la **référence figée** (`pn2222a` — inscription et paramètres fixés) et le **prototype générique** (`npn`/`pnp` — tout est propriété, l'import de son propre SVG reste possible).

## Retouche SVG (détail : /retouche)
- Convention : CENTRE de pastille = croisement de la grille 10 px ; repère = coin haut-gauche du viewBox « tel quel » ; power = rond rouge, gnd = rond noir.
- Pièges Inkscape : `id="board"` perdu, ids dupliqués suffixés (`pin-VSS-1`).
- Vérification géométrie/alignement : rendu Chrome headless (/preview) — ne jamais demander à Frank de coller des logs console.

## Traductions — jamais au fil de l'eau
Règle globale : **rien de traduit pendant le travail courant**. Langue de base seulement (FR pour `docs/`, EN pour les chaînes du code), les autres langues en un seul lot **avant publication**, sur demande de Frank. Concerne `docs/en/`, `l10n/bundle.l10n.fr.json`, README localisés et le bloc `l10n` des composants de bibliothèque (`kablix_components/_sources.json`, langue de base = EN). Le manque se note ⏳ dans `todo.md` et ne bloque pas un lot.

## Versions et livraison (détail : /livre)
- Deux numéros : **publique** `ANNÉE.MOIS.incrément` (`version` de package.json = la version **déjà en ligne**, jamais la suivante ; on l'incrémente au moment MÊME de publier, incrément remis à 0 au changement de mois — **exception en cours : `2026.9.0` y est déjà posée, en attente de la publication demandée par Frank ; la dernière version en ligne est `2026.8.99`**) et **interne dev** `buildNumber` (4e segment, démarre à 1, ne repart jamais à 0, bumpé à CHAQUE lot). Affichage : `src/version.ts` (`versionAffichee()` = 4 segments hors production, `versionPublique()` pour les fichiers utilisateur).
- Calver AUSSI pour les composants de la bibliothèque publique (`kablix_components/_sources.json`) : jamais de semver `1.2.0`. Après bump d'un composant : `node scripts/build-kompix.mjs` puis `node scripts/build-components-index.mjs`.
- Chaque lot : todo.md (✅/⏳/⬜, numéro de version AU-DESSUS de ses items) + bump du `buildNumber` + build + commit + push.
- `.vsix` : jamais automatique — `npm run package` seulement sur demande explicite de Frank.
