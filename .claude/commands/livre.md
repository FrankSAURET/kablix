---
description: Livre le lot courant — todo.md, bump version, build, commit, push
argument-hint: [résumé du lot]
---
Livre le lot courant, dans cet ordre, sans t'arrêter entre les étapes :

1. `npm run typecheck` — corriger TOUTES les erreurs d'un coup avant de continuer.
2. Bump le `buildNumber` dans `package.json` (numéro interne, 4e segment, +1 à chaque lot). **Ne PAS toucher à `version`** : elle porte la version DÉJÀ publiée et ne bouge qu'au moment même d'une publication (elle passe alors au calver du mois du jour — prochaine publication : `2026.8.103`).
3. Mettre à jour `todo.md` : section `# vX` de la nouvelle version EN HAUT du journal (numéro AU-DESSUS de ses items), items numérotés préfixés ✅/⏳/ℹ️ ; retirer de la liste « à faire » ce qui est traité. Résumé du lot : $ARGUMENTS
4. `npm run build`
5. `git add -A && git commit -m "vX : <résumé du lot>"` (+ signature Claude).
6. `git push`

Ne PAS construire le `.vsix` : `npm run package` seulement si Frank le demande explicitement.

Fin : tableau Action | Résultat | Annulation.
