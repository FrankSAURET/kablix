---
description: Livre le lot courant — todo.md, bump version, build, commit, push, vsix
argument-hint: [résumé du lot]
---
Livre le lot courant, dans cet ordre, sans t'arrêter entre les étapes :

1. `npm run typecheck` — corriger TOUTES les erreurs d'un coup avant de continuer.
2. Bump la version dans `package.json` : format ANNÉE.MOIS.incrément (l'incrément repart à 0 en début de mois — vérifier le mois courant).
3. Mettre à jour `todo.md` : section `# vX` de la nouvelle version EN HAUT du journal (numéro AU-DESSUS de ses items), items numérotés préfixés ✅/⏳/ℹ️ ; retirer de la liste « à faire » ce qui est traité. Résumé du lot : $ARGUMENTS
4. `npm run build`
5. `git add -A && git commit -m "vX : <résumé du lot>"` (+ signature Claude).
6. `git push`
7. `npm run package` — vérifier que le `.vsix` est bien produit.

Fin : tableau Action | Résultat | Annulation.
