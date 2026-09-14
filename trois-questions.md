# Trois questions autour de Wokwi

Les deux premières sont des **idées** prises dans l'étude
[concurrents.md](concurrents.md) (§2.4). Elles ne sont **pas** versées d'office
dans [Pistes.md](Pistes.md) : c'est ton fichier. Ce document dit ce que chacune
vaut, ce qu'elle coûte **chez nous**, et où elle se branche dans le code existant.

La troisième est une **inquiétude** que tu as posée : l'import Wokwi a-t-il été
cassé par le ménage de la v2026.9.4.80 ? Réponse courte en tête de §3 : non.

---

## 1. Le mode confidentiel

### Ce que fait Wokwi

Un réglage `wokwi.hidePersonalInfo`, à mettre à `true` dans les paramètres de
VS Code. Une fois armé, leur extension cesse d'afficher ce qui identifie la
personne ou sa machine : chemins de fichiers, nom de compte, jeton de licence.
Le circuit et le code, eux, ne changent pas.

C'est pensé pour une seule situation, mais elle est fréquente : **on projette son
écran**. Vidéoprojecteur en classe, partage d'écran en visioconférence,
enregistrement d'une capture vidéo pour un tutoriel.

### Pourquoi c'est pertinent pour Kablix

Kablix est fait pour l'enseignement. Le cas « un professeur projette Kablix
devant sa classe » n'est pas un cas limite chez nous, c'est le cas normal.

**Mais il faut commencer par une bonne nouvelle : l'atelier lui-même ne fuit
presque rien.** Vérification faite dans le code, le chip du fichier de code
n'affiche que le **nom de fichier**, jamais le chemin — l'extension coupe le
chemin avant l'envoi (`uri.fsPath.split(/[\\/]/).pop()`,
[panel.ts:985](src/panel.ts#L985)), et l'infobulle reçoit ce même nom déjà coupé.
La webview n'a donc jamais le chemin absolu sous la main. Ce n'est pas un hasard
heureux, c'est la conséquence d'un choix d'interface : le chip doit rester court.

Ce qui fuit, c'est **ce qui entoure** l'atelier :

- L'explorateur de VS Code, ouvert à côté, affiche l'arborescence réelle.
- Le titre de la fenêtre porte le chemin du workspace.
- Les messages d'erreur de compilation citent des chemins absolus.
- Les notifications de Kablix en citent aussi, par exemple
  `Kablix: SVG editor set to {0}` ([panel.ts:177](src/panel.ts#L177)).
- Le manifeste `.projix` garde `codeFileAbs`, le chemin absolu du poste
  d'enregistrement ([projix.ts](src/projix.ts)) — invisible à l'écran, mais il
  part avec le fichier quand on distribue un TP aux élèves.

Le risque n'est pas dramatique — il n'y a ni mot de passe ni compte chez nous,
Kablix étant hors-ligne. C'est un risque de **confidentialité ordinaire** : le
nom complet du professeur, la structure de ses dossiers, parfois le nom d'un
autre établissement resté dans un chemin. Devant trente élèves qui filment
l'écran au téléphone, ça suffit.

### Ce que ça coûte chez nous

**Petit — et plus petit que je ne le croyais avant de regarder.** Le recensement,
qui est d'ordinaire le gros du travail, est déjà à moitié fait par la coupure
systématique des chemins côté atelier.

Reste un vrai problème de périmètre, et il faut le dire franchement : **la moitié
de ce qui fuit ne nous appartient pas.** Le titre de la fenêtre et l'explorateur
sont à VS Code, pas à Kablix. Wokwi a exactement la même limite — leur
`hidePersonalInfo` ne masque que ce que leur extension affiche. Un mode
confidentiel chez nous serait donc honnête à condition de ne pas promettre plus
qu'il ne fait : il couvre Kablix, pas l'éditeur autour.

Ce qui nous reste en propre : les notifications, les messages d'erreur de
compilation que nous remettons en forme, et `codeFileAbs`.

Trois questions à trancher :

1. **Jusqu'où masquer ?** Le minimum utile : les chemins absolus de nos messages
   deviennent des noms de fichiers. Un cran plus loin : masquer aussi le nom du
   projet, qui peut porter un nom d'élève (`TP3 - Dupont.projix`). Mon avis :
   s'arrêter aux chemins. Masquer le nom du projet gêne le professeur qui a
   justement besoin de savoir quel projet il montre.
2. **Le réglage suffit-il, ou faut-il une bascule ?** Un paramètre VS Code se
   change en quatre clics, ce qui est trop lent quand on vient de brancher le
   vidéoprojecteur. Une entrée dans le menu hamburger, à côté de « Paramètres »
   (ajoutée au lot v2026.9.5), coûte trois lignes de plus et se déclenche au
   moment voulu.
3. **Et `codeFileAbs` dans le `.projix` ?** C'est le seul point où l'information
   ne fait pas que s'afficher : elle **voyage**. Si le mode confidentiel a un
   sens, il doit aussi cesser d'écrire ce champ à l'enregistrement. C'est deux
   lignes, mais il faut y penser — et savoir que le repli de résolution du
   fichier de code sera alors moins bon sur le poste d'origine.

**Verdict : S**, en assumant que le mode ne couvre que Kablix. Un banc peut le
figer : rendre nos messages avec un chemin témoin (`C:\Users\TÉMOIN\…`) et
vérifier qu'il n'apparaît nulle part une fois le mode armé. C'est exactement le
genre de contrôle qui ne dérive pas.

---

## 2. Voir le `.projix` en texte

### Ce que fait Wokwi

Chez eux, le schéma **est** un fichier du projet : `diagram.json`, du JSON à
plat, posé à côté du `.ino`. Il s'ouvre dans l'éditeur de texte de VS Code comme
n'importe quel autre fichier — il n'y a rien à écrire pour ça, c'est simplement
la conséquence de leur format. Leur extension ajoute juste une bascule pour
passer de la vue graphique à la vue texte et revenir.

Deux usages réels :

- **Dépanner un schéma cassé.** Un composant qui refuse de s'afficher, un fil
  qui pointe vers une broche disparue : on le voit dans le texte en dix secondes,
  là où l'interface graphique ne montre qu'un trou.
- **Comprendre le format.** Pour qui veut générer des schémas par script, ou
  écrire un exercice à trous, lire le format est le premier pas.

### Pourquoi c'est moins direct chez nous

C'est là que la comparaison se retourne. **Le `.projix` n'est pas un fichier
texte : c'est une archive ZIP** ([projix.ts](src/projix.ts)) qui contient le
manifeste `kablix.json`, le schéma, et **tous les fichiers de code** nécessaires
à l'exécution. Un « ouvrir dans l'éditeur de texte » ne peut donc pas être une
simple bascule — VS Code afficherait des octets compressés.

Ce format n'est pas un défaut, c'est un choix qui nous sert : un `.projix` se
donne à un élève par clé USB et il contient tout. Chez Wokwi, `diagram.json` sans
le `.ino` à côté ne vaut rien. Mais il rend cette idée-ci plus chère que chez eux.

Autre différence, qui joue dans le même sens : notre schéma est déjà servi par un
**éditeur personnalisé** (`customEditors`, `kablix.projix`,
[package.json:214](package.json#L214)). VS Code sait nativement proposer
« Rouvrir avec… » sur un fichier qui a un éditeur personnalisé — mais il
rouvrirait le ZIP brut, pas son contenu.

### Les trois façons de le faire, et ce qu'elles coûtent

**(a) Vue texte en lecture seule.** Une commande « Voir le schéma en texte »
ouvre un document virtuel (VS Code a ce qu'il faut : un
`TextDocumentContentProvider`, sur un schéma d'URI à nous) contenant le JSON du
schéma, extrait de l'archive à la volée et remis en forme. Coloration syntaxique
gratuite, recherche gratuite, aucun risque : on ne peut rien casser.

Couvre le second usage (comprendre le format) et **la moitié** du premier (voir
ce qui cloche, sans pouvoir le corriger sur place). **Coût : S.**

**(b) Vue texte modifiable.** Même chose, mais l'enregistrement du document
texte réécrit l'archive et recharge l'atelier. Couvre tout, y compris réparer un
schéma à la main.

Le prix n'est pas dans l'écriture, il est dans les **cas tordus** : JSON
invalide à l'enregistrement (il faut refuser proprement, sans perdre le projet),
édition simultanée de la vue texte et de la vue graphique (laquelle gagne ?),
annulation qui doit traverser les deux vues. Aucun n'est insoluble, tous demandent
d'être traités. **Coût : M**, et un banc sérieux derrière.

**(c) Ouvrir l'archive entière.** Extraire le `.projix` dans un dossier
temporaire et l'ouvrir comme un dossier. Montre tout — manifeste, schéma, code.
Mais on quitte l'atelier pour un explorateur de fichiers, et la question du
retour (réimporter les modifications) rouvre exactement les problèmes de (b).
**À écarter** : c'est (b) avec une couche d'indirection en plus.

### Mon avis

**(a) maintenant, (b) seulement si le besoin se manifeste.** La vue en lecture
seule prend l'essentiel de la valeur pour une fraction du prix, et ne peut pas
corrompre un projet. Si un jour tu te retrouves à réparer un schéma à la main
plus d'une fois, (b) se greffera dessus sans rien jeter de (a).

Un point à trancher si tu prends (a) : **montrer le schéma seul, ou le manifeste
avec ?** Le manifeste porte `codeFileAbs` — c'est-à-dire, précisément, ce que le
mode confidentiel de la première idée cherche à cacher. Les deux idées se
croisent ici.

---

## 3. L'import Wokwi est-il encore entier ?

### La réponse d'abord

**Non, la suppression n'a rien cassé. Les deux choses n'ont jamais eu de rapport.**

L'inquiétude est légitime — les deux fonctions lisaient un `.json` et le mot
« import » figure dans les deux noms — mais elles ne lisaient pas le **même**
`.json`, et rien n'appelait l'une depuis l'autre.

### Ce qui a été supprimé en v2026.9.4.80

La fonction `importCustomPart()` (enregistrement `fb2464a`). Elle validait ceci :

```ts
if (typeof data.label !== 'string' || !data.label) throw new Error(t('missing "label" field.'));
if (typeof data.svg !== 'string' || !data.svg.includes('<svg')) throw new Error(t('missing or invalid "svg" field.'));
if (!Array.isArray(data.pins)) throw new Error(t('missing "pins" field.'));
```

`label`, `svg`, `pins` : c'est la description d'**un seul composant dessiné à la
main**, dans un format maison antérieur au `.kompix`. Ce n'était pas du Wokwi, et
ça n'a jamais su lire un projet Wokwi — un `diagram.json` n'a ni `label`, ni
`svg`, ni `pins` au premier niveau ; il a `parts` et `connections`. Passé à cette
fonction, un vrai `diagram.json` aurait été refusé dès la première ligne.

Ce format a été remplacé par le `.kompix`, qui est la voie actuelle pour les
composants personnalisés. La suppression n'a donc retiré qu'un doublon mort.

### Ce qui importe les projets Wokwi, et qui est bien vivant

Un chemin complet et distinct, en trois étages :

1. **L'entrée dans l'interface.** Le menu hamburger porte l'entrée
   « Import a Wokwi diagram » ([webview-html.ts:138](src/webview-html.ts#L138)),
   qui déclenche la commande `kablix.importWokwiDiagram`
   ([extension.ts:163](src/extension.ts#L163)).
2. **La lecture du fichier**, côté extension :
   [`importWokwiDiagram()`](src/panel.ts#L1899) ouvre un sélecteur filtré sur
   `.json`, lit l'octet, analyse le JSON et le poste à la webview.
3. **La conversion et le chargement**, côté webview : le message `importWokwi`
   ([sim.mts:4801](src/webview/sim.mts#L4801)) appelle
   [`fromWokwiDiagram()`](src/webview/diagram/wokwi.mts#L173), charge le schéma
   obtenu, marque le projet comme non enregistré et **adopte la carte du premier
   microcontrôleur reconnu** dans le schéma.

Aucun de ces trois étages n'a été touché par le ménage.

### Et les composants, alors ?

C'est la partie de ta question qui mérite une vraie réponse, parce qu'elle n'a
rien d'évident.

Kablix ne « lit » pas les composants d'un projet Wokwi comme il lirait des
fichiers joints. **Il les reconnaît par leur type.** Nos composants intégrés sont
des forks 1:1 des éléments Wokwi : même balise à préfixe près (`kablix-led` ↔
`wokwi-led`), mêmes noms de broches. La conversion est donc un simple échange de
préfixe, avec quelques cas particuliers (cartes Pico, platine d'essai).

Trois conséquences à connaître :

- **Un composant que nous avons dans la bibliothèque est importé entier**, avec
  sa position, sa rotation et ses attributs (`attrs` est recopié tel quel).
- **Un type Wokwi que nous n'avons pas est ignoré, mais pas en silence.** Il est
  collecté dans `skipped`, et le message d'état l'annonce : « projet Wokwi chargé
  (N composant(s) non pris en charge ignoré(s)) ». Les fils qui aboutissaient à
  un composant ignoré sont écartés eux aussi — sinon ils pendraient dans le vide.
- **Un composant personnalisé Wokwi (`wokwi-custom-part`) n'est pas importable**,
  et ne peut pas l'être : chez eux, le dessin vit dans un fichier séparé que le
  `diagram.json` ne contient pas. Il n'y a rien à lire.

C'est la limite réelle de l'import — et elle est **structurelle, pas
accidentelle**. Elle existait avant le ménage et existe toujours.

### Comment s'en assurer, concrètement

C'est déjà outillé. Le banc [verify-wokwi.mjs](scripts/verify-wokwi.mjs)
(`npm run verify:wokwi`, 26 contrôles, vert) tient l'aller-retour :

- export vers le format Wokwi (types, positions, rotations, connexions) ;
- réimportation du résultat, avec retour aux types internes ;
- conservation des retournements et des coudes de fils, qui n'ont pas
  d'équivalent Wokwi et voyagent dans un bloc d'extension `kablix` qu'un éditeur
  Wokwi ignore ;
- les deux nommages de la carte Pico, l'ancien (`wokwi-pi-pico`) et l'actuel
  (`board-pi-pico`) ;
- et le cas qui nous occupe : **« composant connu importé, inconnu ignoré »**,
  « type inconnu signalé », « fil vers un composant ignoré écarté ».

Autrement dit, la question que tu poses est exactement celle que trois de ces
contrôles surveillent en permanence. S'ils rougissent un jour, l'import a été
cassé ; tant qu'ils sont verts, il ne l'est pas.

**Un manque tout de même, et il est honnête de le dire :** le banc éprouve
`fromWokwiDiagram` **en isolation**, avec un objet JSON fabriqué. Il ne joue pas
les étages 1 et 2 — le sélecteur de fichier et l'envoi à la webview. Une panne
qui ne toucherait que le passage de message (commande débranchée du menu, message
renommé d'un côté seulement) passerait entre les mailles. Le coût d'un contrôle
sur ces deux étages est **XS** : vérifier que l'identifiant de commande du menu,
celui de `extension.ts` et celui du manifeste sont le même, et que le type de
message posté par `panel.ts` est bien celui attendu par `sim.mts`. À noter comme
piste si tu veux fermer le trou.

---

## Récapitulatif

| Idée | Coût | Ce qu'on a déjà | À trancher |
|---|---|---|---|
| Mode confidentiel | **S** | Rien à écrire côté logique, un seul remplacement à appliquer | Jusqu'où masquer ? Réglage ou bascule au menu ? `codeFileAbs` aussi ? |
| Schéma en texte, lecture seule | **S** | `unpackProject` lit déjà l'archive ; VS Code fournit le document virtuel | Montrer le manifeste, ou le schéma seul ? |
| Schéma en texte, modifiable | **M** | Idem, plus la réécriture d'archive | Conflit entre les deux vues, JSON invalide, annulation |
| Contrôle du branchement de l'import Wokwi | **XS** | `verify:wokwi` couvre déjà la conversion | Rien — c'est un trou à boucher, pas un choix |

Les deux idées restent plus modestes que les chantiers du
[roadmap.md](roadmap.md) (verrou de schéma, locales AVR, linter électronique).
Elles ne les remplacent pas — ce sont des finitions, pas des fonctions.

La troisième ligne n'est pas une idée mais une **assurance** : l'import Wokwi
fonctionne, sa conversion est éprouvée, seul son câblage au menu ne l'est pas.
