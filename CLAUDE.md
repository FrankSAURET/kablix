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

## Retouche SVG (détail : /retouche)
- Convention : CENTRE de pastille = croisement de la grille 10 px ; repère = coin haut-gauche du viewBox « tel quel » ; power = rond rouge, gnd = rond noir.
- Pièges Inkscape : `id="board"` perdu, ids dupliqués suffixés (`pin-VSS-1`).
- Vérification géométrie/alignement : rendu Chrome headless (/preview) — ne jamais demander à Frank de coller des logs console.

## Versions et livraison (détail : /livre)
- Version = ANNÉE.MOIS.incrément ; l'incrément repart à 0 chaque mois (juillet 2026 → 2026.7.x).
- Chaque lot : todo.md (✅/⏳/⬜, numéro de version AU-DESSUS de ses items) + bump package.json + build + commit + push + vsix.
