# PROGRESSION — Refonte système composants `.kompix`

**État au 2026-08-18, Lot 1 complet ✅ / Lot 2 COMPLET ✅ / Lot 3 COMPLET ✅**

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

## Lots livrés (suite)

### Lot 3 — Gestionnaire de composants (COMPLET ✅)
- Commit `065cfba` (v2026.8.80)
- ComponentManagerPanel : nouveau panneau webview pour télécharger depuis repos distants
  - UI grille avec miniatures, label, version, auteur, description
  - Filtrage « nouveaux seulement » (case à cocher, filtre défaut)
  - Sélection multiple par clic, bouton « Télécharger »
  - Message de statut et rafraîchissement après installation
- Téléchargement depuis repos
  - Récupère `index.json` de chaque dépôt configuré dans `kablix.componentRepositories`
  - Construit URLs complètes du `.kompix` pour chaque composant
  - Fetch les fichiers en mémoire (buffer Uint8Array)
  - Installe via nouvelle méthode `KompixLibrary.saveKompixFromBuffer()`
- Bouton palette remplacé : « ⇪ Import (.json) » → « ⇩ Import components »
- Intégration
  - `extension.ts` : commande `openComponentManager` appelle `ComponentManagerPanel.show()`
  - `panel.ts` : listener `openComponentManager` + handler `downloadComponents`
  - `editor.mts` : postMessage au lieu de file picker
- Traduction : « ⇩ Import components » / « ⇩ Importer des composants » dans i18n.mts
- TypeScript, build ✅

## Lots en cours

### Lot 2 — Exécution comportement embarqué (COMPLET ✅)
- Commit v2026.8.79 (en cours)
- ✅ Custom Part API : init/tick/destroy pour comportements embarqués
  - `custom-part.mts` : interface BehaviorContext, BehaviorModule ; méthodes injectBehavior/tickBehavior/destroyBehavior
  - Contexte expose : pinInfo[], readPin(), writePin(), active, controlValue, switchOn
- ✅ Injection du script via nonce CSP
  - `webview-html.ts` : passage du nonce dans window.KABLIX_NONCE
  - `sim.mts` : injectBehaviorScript() crée `<script nonce="...">` dynamique
  - Compilation du script dans un IIFE stockant le module dans window.__kx_behaviors
- ✅ Branchement aux éléments pendant simulation
  - refreshVisualsInner() : détecte components custom avec module + injecte via el.injectBehavior()
  - renderTick() : appelle tickBehavior() sur tous les éléments tracés
  - stopRun() : nettoyage destroyBehavior() et elementsWithBehavior
- ✅ Modèle de confiance (remote/local)
  - panel.ts : handler 'verifyRemoteBehavior' affiche warning dialog modal
  - sim.mts : verrouille injection si remote non approuvé, attend 'verifyRemoteBehaviorResult'
  - kompixLibrary.ts : acceptBehaviorHash() mémorise la confirmation dans l'index (acceptedAt)
  - Persistence : hash + acceptedAt sauvegardé dans index JSON
- ✅ catalog.mts + kompixLibrary.ts : champ behaviorScript? + kompixMeta dans CustomPartData
- ✅ panel.ts : filtre script avant envoi (nettoyage partsCleaned) + postMessage 'injectBehavior'
- TypeScript 0 erreurs, build ✅

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
