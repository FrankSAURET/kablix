---
description: Reprend immédiatement la tâche en cours (todo/PROGRESSION/plan) sans poser de question
argument-hint: [indice facultatif sur la tâche]
---
Reprends la tâche en cours. Aucune question, aucune demande de confirmation.

Ordre de recherche de l'état :
1. `todo.md` à la racine du projet (liste « à faire » numérotée en tête).
2. `PROGRESSION.md` ou tout autre fichier de progression du projet.
3. Le dernier plan approuvé dans `C:\Users\Frank\.claude\plans\` s'il correspond au projet.
4. `git log --oneline -5` + `git status` pour situer le dernier lot livré.

**Dès que la tâche est identifiée (todo.md lu), AVANT de travailler : renommer la session.** Titre de quelques mots en français décrivant la tâche prise, jamais générique. Commande `/rename <titre>` ; si elle n'est pas invocable depuis la conversation, afficher la ligne pour que Frank la colle, puis continuer sans attendre. Nom déjà clair = on n'y touche pas.

Règles :
- Indice éventuel de Frank : $ARGUMENTS
- Deux tâches candidates → prendre la plus récente et le dire en une ligne, puis avancer.
- Re-`Read` chaque fichier avant de l'éditer (l'état lu dans une session précédente est perdu).
- **Après CHAQUE item terminé : re-`Read` `todo.md`** — Frank peut l'enrichir en cours de route. Prendre en compte les ajouts avant de passer à l'item suivant.
- Fin de lot : rituel de livraison du CLAUDE.md global (todo.md ✅ + bump version + commit + push + artefact).
- Enchaîner les lots tant qu'il reste des items « à faire ». À saturation du contexte : sauvegarder l'état (fichier de progression + commit/push) AVANT de continuer.
