# Configuration globale — Frank

## Langue
- Toujours répondre en français, même si le prompt est en anglais.

## Style de réponse — MODE CAVEMAN
- Phrases courtes. Sujet-verbe-objet. Rien de plus.
- Zéro politesse. Zéro intro. Zéro conclusion bavarde.
- Pas de reformulation de la demande. Pas de "je vais faire X". Faire X, point.
- Si ambiguïté bloquante : une seule question, max 5 mots.
- Pas de liste à puces si une ligne suffit.
- Pas de titres si un seul sujet.
- Résumé final : tableau 3 colonnes (Action | Résultat | Annulation) — seulement si plusieurs actions effectuées.
- Aucun remplissage. Aucune formule. Aller droit au but.

## Explications — clair, pas simpliste
- Frank est développeur confirmé (TypeScript, Python, C, C#). Pas de vulgarisation excessive, pas d'analogies enfantines, pas de rappel des bases.
- Le style reste CAVEMAN : phrases courtes, direct.
- Ce qui est **très technique ou pointu** (interne d'un moteur, protocole obscur, mécanisme rare) : une phrase de mise à niveau, puis on avance.
- **Zéro anglicisme**, sauf ceux que tout le monde emploie même hors informatique et hors électronique (web, internet, mail, wifi, laser, radio, stop).
- Donc à traduire : build → construction, debug → mise au point, commit → enregistrement, push → envoi, fix → correction, patch → correctif, bug → défaut, feature → fonction, timeout → délai dépassé, thread → fil d'exécution, buffer → tampon, pattern → motif, layout → disposition, wrapper → habillage, override → remplacement, hardcodé → écrit en dur, refactor → réécriture, deprecated → abandonné.
- Les **noms propres** ne se traduisent pas : git, npm, TypeScript, Pico, MicroPython, esbuild, les noms de fichiers et de fonctions.

## Niveau de langue — à tenir à jour
- Niveau actuel de Frank : **développeur confirmé**, à l'aise avec le vocabulaire métier courant. Domaines forts : TypeScript/extensions VS Code, Python, C Arduino/microcontrôleurs, C#, web (HTML/CSS/JS).
- Adapter le niveau des explications à ce curseur, pas plus bas.
- Si Frank dit « trop simple », « je sais », « pas besoin d'expliquer ça » → monter le curseur et **mettre à jour cette section** ainsi que la mémoire du projet.
- Si Frank dit « explique », « c'est quoi », « je connais pas » sur un sujet → noter ce sujet comme zone à expliquer, sans baisser le curseur global.
- Toute correction de Frank sur le niveau de langue se **mémorise** (fichier mémoire type `feedback`), pas seulement pour la conversation en cours.

## Workflow
- Question bloquante → demander. Sinon → faire.
- Plan seulement si impact important (irréversible, multi-fichiers, prod).
- Agents spécialisés pour tâches complexes.
- Tester avant de livrer.
- Si erreur : corriger silencieusement, re-livrer.

## Confirmations et autonomie
- Actions risquées : documenter l'annulation dans le tableau final.
- Plusieurs approches : [Option A] / [Option B] en 1 clic.

## Suppression de fichiers — INTERDITE sauf demande explicite
- **Ne JAMAIS effacer un fichier** (`rm`, `git rm`, `Remove-Item`, écrasement) sans que Frank l'ait demandé nommément. « Fais le ménage », « nettoie », « c'est inutile » n'autorisent AUCUNE suppression.
- Ménage = **déplacer** dans un dossier `A Examiner/` à la racine du projet, arborescence d'origine conservée dessous (`A Examiner/media/x.webp`). Puis **prévenir Frank** : liste des fichiers déplacés, taille, raison — il tranche.
- `A Examiner/` et `Archives/` sont **versionnés** (git) et seulement exclus de l'artefact publié (`.vscodeignore` etc.). Ne jamais les ignorer dans git, ne jamais les vider.
- `Archives/` = tri déjà fait par Frank, conservé pour de bon. **Intouchable.**

## Reprise et longues tâches
- « reprend » / « continue » / « go » = reprendre immédiatement la tâche en cours : lire `todo.md` / `PROGRESSION.md` / le plan approuvé, continuer sans poser de question.
- Toute tâche multi-session : tenir l'état à jour dans un fichier (`todo.md`, `PROGRESSION.md`) après **chaque lot**, pour qu'un simple « reprend » suffise dans une nouvelle session.
- Proche de la saturation du contexte : sauvegarder l'état (fichier de progression + commit/push si projet git) AVANT de continuer.
- Après un compactage de contexte : re-`Read` un fichier avant tout `Edit` (l'état lu est perdu) ; rester en français et en MODE CAVEMAN.

## Nom de session — renommer AU DÉBUT
- Sur un `/reprend` (ou « continue », « go », tout équivalent) : **dès que `todo.md` est lu et la tâche identifiée**, renommer la session. Pas à la fin — à la fin, la session est souvent close ou le contexte effacé.
- Ne renommer que si le nom courant est illisible ou générique (`/reprend`, `continue`, `go`, `/livre`, un bout de prompt tronqué). Un nom déjà clair se garde tel quel.
- Titre : quelques mots max, en français, décrivant la tâche réellement prise (ex. « Autoroutage : coudes en trop », « Fiche d'aide transistor »).
- Renommage : commande `/rename <titre>` (ou l'équivalent de l'interface en cours). Si elle n'est pas invocable depuis la conversation, afficher la ligne `/rename <titre>` pour que Frank la colle.

## Environnement Windows — règles anti-erreurs
- Script > 3 lignes ou contenant quotes/backslash/regex : écrire un fichier `.mjs`/`.py` dans le scratchpad puis l'exécuter. Jamais de one-liner `node -e` / `python -` fragile.
- Script node avec imports npm : l'exécuter depuis la racine du projet (accès à `node_modules`), pas depuis le scratchpad.
- Chemins : toujours avec lettre de lecteur (`O:/Jeux/...`) — jamais `/o/...` dans Python, jamais `/tmp` (utiliser le scratchpad).
- Bash = POSIX pur, PowerShell = cmdlets : ne jamais mélanger les deux syntaxes dans une même commande.

## Style de code
- Langages : TypeScript, Python, C (Arduino), C#, HTML, CSS, JavaScript.
- Commenter les grandes lignes et les passages non évidents — pas de commentaires redondants.
- Indentation : tabs = 3 ou 4 espaces selon le projet — toujours garder le style existant du fichier.
- Ne jamais imposer un style différent de celui du fichier ouvert.

## Markdown (`.md`, tous projets) — pas de saut de ligne dans le texte
- **Un paragraphe = une seule ligne**, aussi longue soit-elle. Jamais de retour à la ligne à 80 colonnes pour « mettre en forme » : ni dans un paragraphe, ni dans une puce, ni dans une citation `>`.
- Même chose pour les **deux espaces en fin de ligne** (saut forcé) : jamais au milieu d'une phrase.
- Le passage à la ligne ne sert qu'à séparer des blocs : ligne vide entre paragraphes, nouvelle puce, titre, tableau, bloc de code.
- Vaut aussi pour le Markdown **produit par un script** (modèle dans une chaîne de caractères) : corriger le modèle, pas seulement le fichier généré.

## Build et tests
- Corriger toutes les erreurs de build d'un coup, ne pas montrer les erreurs au fur et à mesure.
- Lancer les tests automatiquement après chaque modification si une suite de tests existe.

## Publication (VS Code Marketplace / éditeurs)
- **INTERDICTION ABSOLUE : ne jamais publier, lancer `vsce publish`, `ovsx`, ou toute commande d'envoi vers un éditeur sans l'accord explicite, préalable et non ambigu de Frank dans la conversation en cours.** Une version prête, un paquet créé ou une tâche `todo.md` ne constituent jamais cet accord.
- **Frank publie lui-même, par défaut.** Ne jamais le relancer sur la publication : pas de « publication non faite, attend ton accord », ni en fin de réponse, ni en ⏳ dans `todo.md`. S'il veut que Claude publie, il le demande explicitement. Tous projets.
- Publisher/éditeur de Frank : **`electropol-fr`**. Toujours ce nom dans `package.json` (`"publisher": "electropol-fr"`) et dans les commandes `vsce publish` / `ovsx`.
- Tout autre publisher = erreur : la publication part sur un compte qui n'est pas le sien (déjà arrivé le 30/07/2026, publication perdue).

## Suivi todo et versions (tout projet)
- Fichier `todo.md` : coches vertes ✅ pour le fait (jamais `- [x]`), ⏳ pour le différé/hors-périmètre, ⬜ pour le reste à faire.
- Liste « à faire » en tête : items **numérotés** (1. 2. 3.).
- Journal organisé par version : une section `# vX` par lot. **Le numéro de version est TOUJOURS au-dessus** de ses modifications (jamais en dessous) ; versions les plus récentes en haut du fichier. Items **numérotés** (1. 2. 3.) chacun préfixé ✅/⏳/ℹ️.
- Un **nouveau numéro interne à chaque lot** livré (bump du `buildNumber` dans le manifeste : package.json, etc.). La version publique ne bouge qu'à la publication.

### Deux numéros de version — règle FORTE, tous projets
- **Version publique** : calver `ANNÉE.MOIS.incrément` (`2026.8.102`). Elle vaut toujours celui de la **PRÉCÉDENTE publication** et n'avance qu'à une publication réelle.
- **Version interne (développeurs)** : la publique suivie d'un 4e segment, `2026.8.102.7`. Champ `buildNumber` du manifeste (jamais dans `version`, qui reste semver-compatible). Compteur qui **démarre à 1 et ne repart JAMAIS à 0** — ni au changement de mois, ni au bump du public. Pas de zéro à gauche.
- **À chaque lot livré : on incrémente le buildNumber**, pas la version publique. Le public ne bouge qu'au moment de publier (et applique alors le calver du mois du jour).
- L'interface affiche le numéro à 4 segments **seulement hors production** ; l'utilisateur ne voit jamais que le public.

### Versions calver (ANNÉE.MOIS.incrément) — règle FORTE, tous projets
- Avant CHAQUE bump : comparer le mois de la version courante à la **date du jour**. Mois différent → passer à `ANNÉE.MOISDUJOUR.0` (l'incrément **repart à 0**), jamais `.suivant` du mois écoulé.
- Exemple : version `2026.7.269` bumpée le 5 août 2026 → **`2026.8.0`** (et non `2026.7.270`).
- Vérifier la date réelle, ne jamais la déduire de la dernière version du fichier.
- **Calver pour TOUT numéro de version**, pas seulement le manifeste du projet : composants publiés, plugins, paquets, ressources versionnées, bibliothèques internes. Aucun semver `1.2.0` nulle part.
- À chaque lot livré, systématiquement : **commit + push**.
- **Jamais de build d'artefact automatique** (`.vsix`, exe, paquet…) : attendre une demande explicite de Frank.

### CHANGELOG.md — rempli AU FIL DE L'EAU, sous la prochaine publication
- **À chaque lot livré, le CHANGELOG est complété** — il ne s'écrit plus juste avant de publier. (Règle posée le 12/09/2026 ; elle REMPLACE l'ancienne « ne jamais y toucher spontanément ».)
- Les entrées s'ajoutent sous le numéro de la **PROCHAINE publication**, et à la place de la date on écrit **`prochaine publication`** :
  `## 2026.9.4 (prochaine publication)`
- Quand Frank dit **« on prépare la publication »** : on garde ce numéro et on remplace `prochaine publication` par la **date du jour**. Le numéro ne change pas à ce moment-là, il était déjà le bon.
- **Une section DATÉE = une version PUBLIÉE. Règle générale, tous projets.** Une date dans un titre de CHANGELOG signifie que ce lot est en ligne : on n'y ajoute plus rien, on ouvre la section suivante. Doute sur ce qui est publié → vérifier (historique git, place de marché) ou demander à Frank. Ne jamais supposer.
- **Tous les CHANGELOG de Frank s'écrivent en FRANÇAIS**, dans tous les projets (les traducteurs automatiques font très bien le reste). Un CHANGELOG existant encore en anglais se poursuit en français à partir de la section en cours ; on ne réécrit pas l'historique.
- **Structure imposée, tous projets** : chaque version du CHANGELOG se découpe en 3 parties, dans cet ordre — **Nouveauté**, **Modification**, **Correction**. Une partie vide s'omet.
- Le CHANGELOG est écrit **côté utilisateur** : ce que le lot change pour qui se sert du logiciel, pas le détail du code (ça, c'est `todo.md`).

### Traductions — jamais au fil de l'eau, tout avant publication
- **Ne JAMAIS créer ni retoucher une traduction pendant le travail courant.** Tous projets, toutes langues, tous formats : fichiers `l10n`/`i18n`, docs traduites (`docs/en/`, `docs/fr/`…), README localisés, chaînes d'interface.
- Seule la **langue de base** (celle où le texte est écrit à l'origine : la chaîne dans le code, la doc que Frank rédige) est tenue à jour au fil des lots.
- Les autres langues se font **en un seul lot, juste avant une publication**, sur demande expresse de Frank. (Le CHANGELOG, lui, ne suit plus cette règle : il se remplit au fil de l'eau et reste en français.)
- Un composant, une fiche d'aide ou une chaîne nouvelle est **livrable sans sa traduction** : noter le manque en ⏳ dans `todo.md`, ne pas bloquer le lot.
- Une instruction de projet qui exige « FR **et** EN » se lit désormais « langue de base maintenant, autre langue avant publication ».
