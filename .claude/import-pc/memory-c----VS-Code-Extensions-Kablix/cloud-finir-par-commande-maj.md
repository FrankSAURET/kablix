---
name: cloud-finir-par-commande-maj
description: "Session en ligne (cloud) : TOUJOURS finir la réponse par la commande qui met à jour la copie locale de Frank."
metadata:
  node_type: memory
  type: feedback
  modified: 2026-09-29T00:00:00.000Z
---

En session en ligne (cloud, `CLAUDE_CODE_REMOTE=true`), chaque réponse finit par le bloc de commandes qui récupère le travail en local, même quand rien n'a été envoyé (le dire alors : « rien de neuf à récupérer »).

Forme par défaut, depuis le dossier du projet dans le terminal de VS Code :

```
git fetch origin
git checkout <branche de la session>
git pull
```

Si Frank est déjà sur la branche : `git pull` seul, en le disant.

**Why:** le 29/09/2026, Frank a redemandé la commande après plusieurs lots : « Ajoute à tes paramètres que quand je suis en ligne tu finis tjs par la commande pour mettre à jour en local ».

**How to apply:** dernière chose de la réponse, après le tableau Action | Résultat | Annulation. Nommer la vraie branche. Sur le PC (session locale), ne s'applique pas.
