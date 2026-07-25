# PROGRESSION — Audit + i18n docs + taille marketplace

Décisions Frank (2026-07-24) :
- Fiches composants : `docs/composants/fr/` + `en/`, `img/` PARTAGÉ (non dupliqué). panel.ts choisit selon `vscode.env.language` (fallback fr).
- Taille marketplace : audit `vsce ls`, exclure superflu, GARDER l'aide locale composants.
- Pas de vsix.

## À faire (ordre)
1. Audit bugs (typecheck + verify:all)
2. Orthographe FR (pas les fichiers EN)
3. Fichiers inutiles → liste + explication (ne rien supprimer)
4. i18n docs/composants : fr/ + en/ + img partagé + panel.ts
5. Traduire 40 fiches EN
6. Doc EN utilisation/usage + guides SVG par langue
7. MàJ tous les liens
8. Minimaliser taille (.vscodeignore, vsce ls avant/après)
9. Bump version + commit + push

## État
- Version courante : 2026.7.170 → cible 2026.7.171
- vsce ls (avant) : contient README copy.md, debug.log, ks.svg, docs/Editing svg components.md → à exclure

## Journal
### v2026.7.173 — icône « réarranger » + emplacements code/Kablix dédiés
- Icône `rearranger.svg` extraite de `media/icones.svg` (groupe renommé `g31`→`rearranger`), bouton dans la barre entre Noms et hamburger, commande `kablix.rearrangeLayout` → `applyDefaultLayout(force)`.
- `layout.ts` : mémorise le CÔTÉ de Kablix (`kablix.layout.kablixSide`) en plus du ratio. `kablixColumn`/`codeColumn` remplacent les `ViewColumn.One/Two` en dur (extension.ts, panel.ts). `saveDefaultLayout` déduit le côté de la colonne du .projix actif. Placer Kablix à gauche + sauver → restauré à gauche.
- Reste item docs (réorganisation en/fr/img + composants) pour un lot suivant.
