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

## Source des dessins : `Composants.svg` (depuis v2026.7.229)
Frank dessine TOUS les nouveaux composants dans `Composants.svg` (Inkscape, planche A3). Règles :
- Un composant = un groupe dont l'**id est le nom du composant** (`diode`). Son schéma interne = groupe `<nom>-interne` (`diode-interne`). Groupe interne absent = pas de vue interne.
- **Mêmes pattes** pour le dessin externe et le schéma interne (mêmes noms, même ordre).
- Les **pastilles rouges** portent le **nom de la patte** (texte au-dessus) et leur CENTRE est le point de connexion des fils. `nc` = non connecté.
- **Ne créer QUE les composants que Frank nomme** : le fichier contient aussi ses dessins en cours (`ic14`, `to92`…), à ignorer.
- **Simulation précisée au cas par cas** par Frank — ne rien inventer.
- Noms de pattes, propriétés et outils de simulation (curseurs, aide…) sont **traduisibles** et effectivement traduits EN + FR.
- Tout nouveau composant : **tests `testkablix`** obligatoires — un test Arduino (`<type>-uno`) ET un test Pico (`<type>-pico`), via `_spec.mjs` + `node testkablix/_generate.mjs` (jamais à la main), plus la ligne dans `testkablix/README.md`.

## Retouche SVG (détail : /retouche)
- Convention : CENTRE de pastille = croisement de la grille 10 px ; repère = coin haut-gauche du viewBox « tel quel » ; power = rond rouge, gnd = rond noir.
- Pièges Inkscape : `id="board"` perdu, ids dupliqués suffixés (`pin-VSS-1`).
- Vérification géométrie/alignement : rendu Chrome headless (/preview) — ne jamais demander à Frank de coller des logs console.

## Versions et livraison (détail : /livre)
- Version = ANNÉE.MOIS.incrément ; l'incrément repart à 0 chaque mois (juillet 2026 → 2026.7.x).
- Chaque lot : todo.md (✅/⏳/⬜, numéro de version AU-DESSUS de ses items) + bump package.json + build + commit + push.
- `.vsix` : jamais automatique — `npm run package` seulement sur demande explicite de Frank.
