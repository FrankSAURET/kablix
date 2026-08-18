# PROGRESSION — Refonte système composants `.kompix`

**État au 2026-08-18, Lot 1 complet ✅ / Lot 2 EN COURS (50%)**

## Lots livrés

### Lot 1 — Bibliothèque locale (COMPLET ✅)
- Commit `2e78602` (v2026.8.77)
- Spec `.kompix` : docs/kompix_specification.md
- Config : `kablix.componentsFolder` (défaut globalStorageUri), `kablix.componentRepositories` (URL dépôts)
- Commandes : `openComponentsFolder` (ouvre explorateur), `openComponentManager` (TODO Lot 3)
- Module `src/kompixLibrary.ts` : 400+ lignes
  - `unpackKompix()` : déplisse ZIP, valide manifest, extrait SVG externe/interne
  - `scanLibrary()` : scan asynchrone, crée CustomPartData pour webview
  - FileSystemWatcher : rescans sur `**/*.kompix` workspace + modifications bibli
  - Index de confiance : loadIndex/saveIndex (hash behavior.mjs, origin, acceptedAt)
  - `saveKompix()`, `removeKompix()`, `getComponents()`, `onDidChangeComponents()` callback
- Intégration extension.ts :
  - Créé `new KompixLibrary(context)` au démarrage
  - Assigné `SimulatorPanel.library = kompixLibrary`
  - Async start() lancée en arrière-plan
- Intégration panel.ts :
  - `SimulatorPanel.library` statique (injection)
  - Changé ligne 1357-1359 : customParts envoyés depuis `library.getComponents()` au lieu de globalState
- Compilation : 0 erreurs TypeScript ✅
- Build : tous les bundles générés ✅

## Lots en cours

### Lot 2 — Exécution comportement embarqué (EN COURS 50%)
- Commit `52945ab` (v2026.8.78)
- ✅ CompiluxLibrary.ts : exposer origin + behaviorHash dans CustomPartData.kompixMeta
- ✅ panel.ts : handler 'verifyRemoteBehavior' + vscode.window.showWarningMessage
- ⏳ custom-part.mts : API behavior (init, tick, destroy)
- ⏳ Injection script via nonce depuis webview
- ⏳ Stockage confirmation hash dans kompixLibrary.saveIndex()

## Prochains lots

### Lot 2 (suite) — À terminer (⏳)
À faire :
1. Étendre `custom-part.mts` ou créer nouvel élément pour injections scripts
2. Injection nonce : webview reçoit texte script (postMessage), construit `<script>` avec nonce
3. API behavior.mjs : define `init(context)`, `tick(context)`, `destroy(context)` et contexte expose `pinInfo`, `readPin()`, `writePin()`, `active`, `control`
4. Avertissement bloquant (hôte d'extension) pour remote origin + code, avant premier tick
5. Modèle de confiance : accepté locaux directement, remote demande confirmation + hash mémorisé
6. Tests : verify:kompix round-trip pack/unpack

### Lot 3 — Gestionnaire de composants (⏳)
UI webview pour télécharger depuis dépôts distants (remplacer bouton ⇪ Import .json)

### Lot 4 — Créateur intégré → export .kompix (⏳)
`creator.mts` : Enregistrer crée `.kompix` dans bibli, export ⇩ produit `.kompix` (save-as)

### Lot 5 — `montre.mjs` + pipeline planches (⏳)
Adapter `/integrer` handler, `_extract-composants.mjs` pour produire `.kompix` au lieu des fichiers brouillon

### Lot 6 — Dépôt public kablix_components/ (⏳)
`build-components-index.mjs` générant index.json + README.md

### Lot 7 — Documentation (⏳)
USAGE.md section kompix, aide intégrée

### Lot 8 — Tests (⏳)
`verify:kompix`, repassage bancs existants

## Points de reprise

- Brancher sur main, checkout HEAD
- Pour continuer Lot 2 : relire le plan agile-cuddling-bird.md (Lot 2, exécution)
- Toutes les commands node produisent bien les bundles ✅
- No git state blocker : tout est commité + poussé
