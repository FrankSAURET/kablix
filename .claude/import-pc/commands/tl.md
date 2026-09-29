---
description: Traduction Ren'Py FR — batch + QA automatique (chaînes vides / anglais résiduel)
argument-hint: [dossier tl/french du jeu]
---
Traduis le jeu Ren'Py en français. Dossier cible : $ARGUMENTS (sinon le déduire du projet courant ou du fichier de progression).

1. Lire `O:\Jeux\Traducteur\PROMPT_TL_RENPY.md` et l'appliquer à la lettre (scripts, tags à préserver, style, interjections, pièges). Interdit de modifier les scripts de `O:\Jeux\Traducteur\`.
2. Lire la progression (`PROGRESSION.md` du jeu) et reprendre au premier fichier non terminé, sans poser de question.
3. Boucle par fichier : extraire (`extract_tl.py`) → traduire la scène ENTIÈRE → appliquer (`translate_tool.py`) → répéter jusqu'à 0 string restante.
4. QA OBLIGATOIRE après chaque fichier : `python "O:\Jeux\Traducteur\qa_tl.py" "<dossier tl/french>" -v` → corriger toute chaîne vide ou non traduite AVANT de continuer. « Suspectes EN » : vérifier une par une, corriger si réellement anglaises. Frank ne doit jamais découvrir lui-même une chaîne vide ou anglaise.
5. Mettre à jour la progression après chaque fichier terminé — un simple « reprend » doit suffire en nouvelle session.
6. Enchaîner les fichiers sans s'arrêter. À saturation du contexte : sauvegarder la progression d'abord.
