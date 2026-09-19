# Créer un composant 3D — un petit véhicule en PMMA

Scénario complet, pas à pas, **pour une vidéo explicative**. On part d'une
planche Inkscape vide et on arrive à un véhicule qui tourne à l'écran, se pose
dans un schéma, et roule en simulation.

Le véhicule : un **châssis découpé au laser dans du PMMA de 3 mm**, avec

- une **Raspberry Pi Pico** posée dessus,
- la **carte moteur** du [scénario 2D](Créer%20un%20composant%202D.md),
- **quatre moteurs à courant continu**, un par roue,
- une **platine d'essai** pour le câblage,
- **quatre roues directement sur l'axe des moteurs** — pas de transmission,
  pas d'engrenage : l'axe du moteur EST l'axe de la roue.

C'est le montage le plus simple qui roule. Et c'est justement pour ça qu'il fait
un bon scénario : tout ce qu'on y voit est essentiel.

**Le guide de référence** derrière ce scénario :
[Dessiner les systèmes en volume](docs/fr/Drawing-systems.md). Ce fichier-ci en
est le déroulé filmé, sur un cas complet.

---

## Ce qui change par rapport au 2D

| | Composant 2D | Système en volume |
| --- | --- | --- |
| La planche | `Composants2D.svg` | **`Composants3D.svg`** |
| L'unité | pixels de la grille 10 px | **millimètres** |
| Ce qu'on dessine | un composant | **des pièces à plat**, comme un plan de découpe laser |
| Ce qui dit où va la pièce | rien — le dessin est le composant | **l'étiquette de pose**, écrite dans le groupe |
| Ce qu'on regarde | une image | **une scène qu'on tourne** (`npm run montre`) |

Le point à retenir : **le dessin reste un plan de découpe**. Les pièces sont
posées côte à côte sur la planche, comme elles le seront sur la plaque de PMMA.
Ce n'est pas leur place sur la planche qui compte — c'est leur **étiquette**.

---

## Avant de commencer

- Le dépôt cloné, `npm install` passé, Node 20+.
- **Chrome / Chromium** (la lecture de la planche calcule de la géométrie SVG :
  ça passe par un navigateur).
- Inkscape.
- Les **images** listées plus bas, prêtes dans un dossier à côté de la planche.

---

## Étape 1 — Les images à préparer

On les prépare **avant** de dessiner, parce qu'on va les poser dans les groupes.

Elles se placent **à côté de `Composants3D.svg`** et sont **embarquées** dans le
module rangé — la webview ne lit jamais un fichier sur le disque.

| Nom du fichier | Ce que c'est | Ce qu'on en fait | Taille visée |
| --- | --- | --- | --- |
| `pico.webp` | photo de dessus d'une Raspberry Pi Pico, fond neutre | posée sur la pièce `vehicule-pico` | ~51 × 21 mm |
| `motodriver3.webp` | photo de dessus de la carte moteur Joy-it | posée sur `vehicule-carte-moteur` | ~57 × 47 mm |
| `breadboard.webp` | photo de dessus d'une platine d'essai demi-format | posée sur `vehicule-platine` | ~82 × 55 mm |
| `moteur-tt.webp` | photo de profil d'un moto-réducteur « TT » jaune | posée sur `vehicule-moteur` | ~70 × 22 mm |
| `roue.webp` | photo de face d'une roue, **fond transparent** | posée sur `vehicule-roue` | ~65 × 65 mm |
| `chassis-deco.webp` *(facultatif)* | une texture ou un logo, pour faire joli sur le dessus | posée sur `vehicule-chassis` | libre |

Trois règles qui évitent les mauvaises surprises :

1. **Préférez le WebP.** Une image liée est embarquée dans le module : un JPEG
   de 4 Mo sur une pièce de 50 mm ne se verra pas mieux, mais il pèsera 4 Mo
   dans l'extension. Inkscape n'importe pas le WebP ? Posez le **PNG**, c'est le
   même résultat.
2. **Une seule image par pièce.** C'est un habillage, pas un collage. La
   deuxième est ignorée.
3. **Détourez la roue** (`Objet → Découpe → Découper`). Une image détourée
   **donne son contour à la pièce** : la roue arrive ronde, avec son trou
   d'axe, sans un tracé à redessiner. C'est le cas d'usage type — une pièce
   qu'on ne découpe pas au laser.

**À filmer :** les six images dans l'explorateur, puis le détourage de la roue
dans Inkscape.

---

## Étape 2 — Dessiner les pièces

Dans `Composants3D.svg`. **Une pièce = un groupe dont l'`id` commence par le nom
de l'assemblage**, ici `vehicule`.

| Groupe | La pièce | Découpée au laser ? |
| --- | --- | --- |
| `vehicule-chassis` | la plaque de PMMA, avec les trous de fixation | **oui** — c'est le plan |
| `vehicule-moteur` | le corps du moto-réducteur | non — habillage |
| `vehicule-roue` | la roue | non — image détourée |
| `vehicule-pico` | la carte Pico | non — image |
| `vehicule-carte-moteur` | la carte moteur | non — image |
| `vehicule-platine` | la platine d'essai | non — image |

> **La planche doit être en millimètres.** `Composants3D.svg` l'est déjà
> (`width="…mm"` et un `viewBox` du même nombre : 1 unité = 1 mm). Une planche
> en pixels serait convertie, mais vous ne sauriez plus ce que vous cotez.

**À filmer :** la planche qui se remplit, les six pièces côte à côte comme sur
une vraie plaque de découpe.

---

## Étape 3 — Les étiquettes de pose

**C'est le cœur du système.** Un simple `<text>` dans le groupe de la pièce, qui
dit comment elle se pose. Un mot de plan en premier, puis des `clé=valeur`.

Voici les six étiquettes du véhicule, à recopier telles quelles :

```text
vehicule-chassis        dessus pos=0,0,0 ep=3
vehicule-pico           dessus pos=0,-20,2 ep=1.6 mat=carte
vehicule-carte-moteur   dessus pos=0,25,2 ep=1.6 mat=carte
vehicule-platine        dessus pos=0,0,4 ep=9
vehicule-moteur         flanc  pos=-46,-35,-12 ep=22 mat=servo miroir=x
vehicule-roue           flanc  pos=-62,-35,-12 ep=6 miroir=x
```

Ce que chaque mot fait :

| Mot | Rôle | Défaut |
| --- | --- | --- |
| `dessus` / `flanc` / `face` | **obligatoire, en premier** : comment le dessin se pose | — |
| `pos=x,y,z` | le **centre** de la pièce dans le repère de l'assemblage, en mm | `0,0,0` |
| `ep=3` | épaisseur, en mm | `3` |
| `mat=pmma` | matière — **seulement pour une pièce sans remplissage** : la couleur du dessin prime | `pmma` |
| `miroir=x` | la pièce est posée **deux fois**, symétriquement | pas de miroir |

Le repère : **X vers la droite, Y vers l'arrière, Z vers le haut.**

### Les trois pièges de l'étiquette

**1. Le séparateur décimal est le POINT.** C'est le piège numéro un, parce qu'il
ne se voit pas sur l'image : le pavé numérique français tape une virgule, or la
virgule sépare déjà les trois coordonnées.

```text
flanc pos=-46,-35,-12 ep=1,6     ← quatre nombres : illisible
flanc pos=-46,-35,-12 ep=1.6     ← juste
```

Une étiquette illisible **ne fait pas d'erreur** : la pièce retombe au centre, à
3 mm d'épaisseur. Elle est bien là, simplement pas où vous croyez. La lecture le
dit en clair — **lisez la sortie de `npm run montre` avant de suspecter le
dessin.**

**2. `miroir` se met sur la NORMALE du plan**, pas sur un axe au hasard. Un
`flanc` a son épaisseur sur **x** : `miroir=x` sépare bien les deux moteurs
gauche et droit. Un `flanc` avec `miroir=y` en poserait un devant et un derrière,
dans le même plan — et vous chercheriez longtemps pourquoi.

**3. `pos` est de CENTRE à CENTRE.** Deux moteurs de 22 mm à `pos=±46` laissent
**70 mm** entre eux et **92 mm** d'encombrement. Ce qu'il faut coter, c'est
l'écart voulu : pour un entrefer *e* entre deux pièces d'épaisseur *ep*,
`pos = (e + ep) / 2`.

**À filmer :** une étiquette tapée avec une virgule, la pièce qui retombe au
centre, le message de la lecture qui l'explique, puis la correction.

---

## Étape 4 — Poser les images

On les glisse dans les groupes, **là où elles doivent être sur la pièce**.

```svg
<g id="vehicule-pico">
  <path class="piece" d="M …" />
  <image x="-25.5" y="-10.5" width="51" height="21" href="pico.webp" />
  <text x="0" y="16">dessus pos=0,-20,2 ep=1.6 mat=carte</text>
</g>
```

Ce qu'il faut savoir, et rien de plus :

- **Là où vous la posez sur la planche, là elle sera sur la pièce** : mêmes
  millimètres, même repère que le contour. Une image qui déborde est **découpée
  au contour**.
- **La transparence est celle du dessin** (`opacity` de l'image ou du calque) :
  réglable au curseur dans Inkscape.
- **Elle se plaque sur le côté qu'on VOIT.** Pas sur un côté choisi d'avance :
  les deux flancs sont projetés et c'est le plus proche de l'œil qui la prend.
  Un demi-tour la fait changer de côté toute seule.
- **Tournez-la, elle suit** : Inkscape écrit une matrice, l'image la garde.

### Une image seule fait la pièce

C'est ce qu'on utilise pour la roue :

| Dans le groupe | Le contour de la pièce |
| --- | --- |
| un tracé fermé (avec ou sans image) | le **tracé** — l'image n'est qu'un décalque |
| une image **détourée** | le **détourage** : la silhouette réelle, trous compris |
| une image nue | le **rectangle** du bitmap |

La roue détourée arrive donc ronde et percée, sans un tracé. La lecture
l'annonce comme n'importe quelle pièce :

```text
  ✓ roue : 84 points, 65×65 mm, flanc ép.6 pmma, 1 trou(s)
```

**À filmer :** la roue avant / après détourage, et le résultat en volume.

---

## Étape 5 — Les couleurs

**La pièce a en volume la couleur qu'elle a sur la planche**, transparence
comprise. Rien à écrire dans l'étiquette.

Pour notre véhicule :

- le **châssis** en bleu clair à **55 % d'opacité** — le PMMA translucide : on
  verra les moteurs au travers sans éclater le montage ;
- les **cartes** portent leur image, la couleur ne se voit pas ;
- les **moteurs** en jaune (le moto-réducteur TT est jaune).

Quelques détails :

- C'est le remplissage **effectif**, celui que le navigateur calcule — Inkscape
  pose souvent la transparence sur le **calque**, pas sur la pièce.
- La couleur retenue est celle de la **plus grande forme remplie** du groupe.
  Un perçage ou un texte ne décide pas de la teinte.
- Une pièce **sans remplissage** n'a pas de couleur à donner : c'est alors
  `mat=` qui répond (`pmma`, `alu`, `servo`, `carte`, `laiton`, `pile`).
- **Une matière translucide n'a pas de liseré** : sur une plaque découpée en
  dizaines de triangles, le liseré dessinerait une toile d'araignée. Il est
  retiré dès que la couleur est transparente.

---

## Étape 6 — Les axes : les roues sur les moteurs

C'est ce qui fait que **les roues se posent toutes seules sur les moteurs**,
sans une cote à reporter.

Une **pastille rouge** dans le groupe d'une pièce marque une **articulation**.
Son centre devient un **axe** — une droite dirigée comme l'épaisseur de la
pièce.

| La pièce est un… | Son épaisseur part | L'axe est | Ce que ça fait |
| --- | --- | --- | --- |
| `dessus` | verticalement | **vertical — Z** | une rotation à plat |
| `flanc` | en travers | **en travers — X** | **une roue qui tourne** ← notre cas |
| `face` | d'avant en arrière | **d'avant en arrière — Y** | une charnière |

Nos moteurs et nos roues sont des `flanc` : leurs axes pointent en travers du
véhicule. C'est exactement l'axe d'une roue.

### Comment nommer

> **Une pastille rouge est une articulation à elle seule.** Son **premier mot**
> est la **famille** — il dit *à quoi ça s'emboîte* ; ce qui suit ne sert qu'à
> donner des ids distincts à deux pastilles voisines, comme Inkscape l'exige.

Pour le véhicule :

```text
vehicule-chassis    axe-ag  axe-ad  axe-rg  axe-rd   ← QUATRE pastilles « axe »
vehicule-moteur     axe                              ← UNE de la même famille
                    arbre                              ← offre un « arbre »
vehicule-roue       arbre                            ← s'emboîte sur le moteur
```

Quatre pastilles `axe…` sur le châssis, une sur le moteur : **le moteur est
dupliqué quatre fois**. Chaque moteur offre un `arbre`, la roue en cherche un :
**quatre roues naissent**. Trois dessins, un véhicule complet.

Deux façons de nommer une pastille, **dans cet ordre** :

1. son **ID Inkscape** — sélectionner le rond, `Objet → Propriétés de l'objet`,
   écrire `axe-ag` ;
2. à défaut, le **texte libre le plus proche**, celui du dessus préféré.

L'ID passe devant parce qu'il **colle au rond** : il survit à un déplacement et
n'encombre pas la planche de quatre étiquettes. Un id fabriqué par Inkscape
(`circle91`, `path102`) **ne nomme rien** : la pastille est ignorée, avec un
avertissement.

> ⚠️ **Une pièce ronde et rouge se trace en CHEMIN, jamais en cercle.** Une
> pastille, c'est un `<circle>` rouge. Un phare rouge dessiné au cercle en
> serait un, et la pièce partirait en articulation au lieu d'être découpée.
> `Chemin → Objet en chemin` règle ça.

### Les règles d'emboîtement

1. Deux ensembles dont une pastille porte le **même premier mot** s'emboîtent.
2. **Celui qui offre le plus d'articulations porte l'autre.**
3. **Les deux axes sont superposés et centrés sur leur zéro** — la position ne
   se calcule pas, elle se lit dans le dessin.
4. Plusieurs pastilles chez le parent → chaque exemplaire est **tourné vers la
   sienne**. Une seule → l'enfant garde le cap de son parent.

**À filmer :** la case **axes dessinés** du visualiseur, les quatre droites
rouges en pointillé qui sortent du châssis, et les roues posées dessus.

---

## Étape 7 — L'étiquette de taille

Les cotes sont en millimètres, mais le composant fini est posé dans une
**feuille**, en pixels de la grille 10 px. Combien de pixels de large ? **C'est
écrit sur la planche**, hors de tout groupe de pièce :

```text
système : vehicule largeur : 640
```

Un simple `<text>` qui parle du système entier, pas d'une pièce. Accents,
majuscules, `=` au lieu de `:` et ordre inversé sont admis.

| Ce qui est écrit | Ce que ça fait |
| --- | --- |
| `système : vehicule largeur : 640` | la feuille du véhicule fait 640 px de large |
| étiquette absente | le composant garde sa **taille de repli**, écrite dans le code |
| `système : vehicule` (sans largeur) | ignorée, avec un message à la lecture |

**Agrandir le véhicule se fait donc dans Inkscape**, plus dans le code : tout ce
qui est en pixels — épaisseur des contours, grain des faces, ombres, marges —
suit ce seul nombre.

---

## Étape 8 — Le regarder tourner

**C'est LA boucle de travail.** On redessine dans Inkscape, on clique
**↻ recharger**, on regarde.

```bash
npm run montre vehicule
```

L'argument est un **préfixe**, pas un nom exact : l'outil ramasse tous les
assemblages et profils qui commencent par là, et les **monte** les uns sur les
autres. La planche n'est lue qu'**une fois** (la lecture passe par Chrome :
c'est le temps d'attente, autant ne le payer qu'une fois).

Ce qu'on utilise dans la fenêtre :

| Commande | À quoi ça sert |
| --- | --- |
| **↻ recharger** | relire la planche **sans quitter la fenêtre**. L'angle, le zoom et les cases sont conservés |
| **Glisser dans la vue** | tourner autour — l'angle où ça coince n'est jamais celui de la première image |
| Curseur **éclaté** | écarter les pièces le long de leur épaisseur : le seul moyen de voir entre deux plaques serrées |
| Case **×4** | décochez-la : quatre roues cachent le châssis qu'on voulait voir |
| Case **axes dessinés** | les articulations à leur place, avec la droite de l'axe en pointillé rouge |
| Case **repère X Y Z** | le repère dans un coin, tourné avec la scène : il dit où est l'avant |
| Case **monté sur ses articulations** | le véhicule assemblé. Décochée, on retombe sur les dessins séparés |

Le panneau affiche l'**encombrement en millimètres** (`184 × 140 × 38 mm`) :
c'est la cote qu'on lit sur un plan de montage, et le **premier signe qu'une
pièce est posée de travers**.

Ce qui est lu est aussi **rangé** : `assemblages.mts` et `profils.mts` sont
réécrits.

**À filmer :** l'aller-retour complet — on bouge un moteur dans Inkscape, on
enregistre, on clique ↻, le véhicule change à l'écran. C'est le plan le plus
parlant de toute la vidéo.

---

## Étape 9 — En faire un composant posable

Une fois le montage juste, on le range pour de bon et on en tire les images :

```bash
npm run assemblage vehicule                       # range sans ouvrir de fenêtre
node scripts/_capture-profil.mjs vehicule:assemblage vehicule:eclate
npm run verify:assemblage                         # le banc
```

Puis la chaîne d'un composant ordinaire — **exactement les étapes 3 à 5 du
[scénario 2D](Créer%20un%20composant%202D.md)** : un élément dans
`src/webview/composants/`, l'import dans `sim.mts`, l'entrée au catalogue avec
son `kind`, le préfixe de repère.

La différence : l'élément ne charge pas un SVG plat, il demande son assemblage
au moteur isométrique et lit sa largeur par `systemeLargeur('vehicule')`.

Les pattes du composant, elles, sont celles qui sortent **vers le schéma** :

| Patte | Vers quoi |
| --- | --- |
| `M1+`, `M1-` … `M4+`, `M4-` | les quatre moteurs, à câbler sur la carte moteur |
| `VBAT`, `GND` | l'alimentation |

---

## Étape 10 — Le comportement en simulation

**C'est la seule étape qui ne se déduit de rien.** Le dessin ne dit pas ce que
fait le véhicule.

### Ce que le véhicule doit faire

1. **Chaque roue tourne** quand son moteur reçoit une tension : sens selon la
   polarité, vitesse selon le rapport cyclique. En volume, la roue tourne
   autour de son axe `arbre` — celui de l'étape 6.
2. **Le véhicule avance** quand les quatre roues tournent dans le même sens,
   **pivote** quand les deux côtés s'opposent. C'est tout le pilotage
   différentiel.
3. **Les défauts** se signalent avec leur **cause** :

| Situation | Message |
| --- | --- |
| un moteur branché sur une seule borne | « le moteur avant gauche n'a qu'une borne câblée » |
| alimentation absente | « le véhicule n'est pas alimenté » |
| les quatre moteurs sur la même sortie | « les quatre moteurs sont sur le même canal : le véhicule ne pourra pas tourner » |

### Sans IA

On l'écrit à la main, en prenant comme modèle le système le plus proche déjà
intégré — le **robot araignée** (`araignee`), qui est le cousin direct : même
moteur isométrique, mêmes articulations lues dans le dessin, mêmes servos
commandés depuis la simulation.

La méthode :

1. **Ouvrir le composant araignée** et repérer comment il lit ses articulations
   (`profileAxes`) et comment il applique un angle à une pièce.
2. **Remplacer l'angle par une vitesse** : une roue ne se positionne pas, elle
   tourne en continu. L'angle s'accumule à chaque pas de simulation.
3. **Brancher les quatre roues** sur les quatre états moteur venus de la carte
   moteur — les mêmes que l'étape 6 du scénario 2D.
4. **Éprouver au banc** : un `scripts/verify-vehicule.mjs` qui rend le vrai
   éditeur dans Chrome sans interface, lance un programme qui fait avancer puis
   pivoter le véhicule, et **mesure** l'angle de chaque roue.

Comptez une demi-journée. L'essentiel du temps part à faire tourner les roues
dans le bon sens — les quatre, du bon côté.

### Avec IA

Une IA agentique fait très bien les étapes 4, 9 et une bonne part de la 10. Elle
ne fait **pas** le dessin, ne pose **pas** les images, et ne **devine pas** le
comportement — si on ne le lui dit pas, elle inventera quelque chose de
plausible et de faux.

Le `CLAUDE.md` à la racine lui donne déjà les conventions : inutile de les
recopier. Ce qu'il faut lui dire :

```text
Fais le composant « vehicule » à partir de Composants3D.svg. Les six pièces
sont dessinées et étiquetées : vehicule-chassis, -pico, -carte-moteur,
-platine, -moteur (miroir=x), -roue (miroir=x).

Les articulations sont posées : quatre pastilles « axe » sur le châssis, une
« axe » et une « arbre » sur le moteur, une « arbre » sur la roue. Donc quatre
moteurs et quatre roues.

Pattes du composant : M1+/M1- à M4+/M4-, VBAT, GND.

Simulation : chaque roue tourne EN CONTINU autour de son axe « arbre ».
Le sens vient de la polarité du moteur, la vitesse du rapport cyclique.
L'angle s'ACCUMULE à chaque pas — une roue ne se positionne pas comme un servo.
Quatre roues dans le même sens = le véhicule avance ; deux côtés opposés = il
pivote.

Défauts à signaler, message expliquant la CAUSE :
- un moteur avec une seule borne câblée (nomme LEQUEL) ;
- alimentation absente ;
- les quatre moteurs sur la même sortie.

Prends l'araignée comme modèle : même moteur isométrique, mêmes articulations
lues dans le dessin. La différence, c'est qu'une roue tourne au lieu de se
positionner.

Fais : npm run assemblage vehicule, les captures, l'élément, l'import dans
sim.mts, le catalogue, le préfixe de repère, la simulation, les chaînes
anglaises, les tests vehicule-uno et vehicule-pico (GÉNÉRÉS), la fiche d'aide
FR avec son illustration. Puis typecheck, build, verify:all.
```

La phrase « prends l'araignée comme modèle » vaut beaucoup d'allers-retours :
elle donne à l'IA un fichier réel à imiter, plutôt qu'un style à deviner.

### Ce qu'il faut relire derrière elle

| À vérifier | Pourquoi |
| --- | --- |
| Le **sens** de rotation des quatre roues | C'est le seul endroit où une IA produit quelque chose de cohérent **et** faux : les roues de droite tournent à l'envers de celles de gauche pour avancer. |
| L'accumulation de l'angle | Une roue traitée comme un servo se positionne au lieu de tourner : à l'écran elle frémit. |
| Les fichiers de test régénérés | `git status` ne doit montrer que les tests du lot. |
| L'illustration de la fiche | Elle doit venir de `_capture-profil.mjs`. |
| Le français de la fiche | Les tournures traduites de l'anglais se repèrent tout de suite. |

**Et surtout : la contre-épreuve du banc.** Un banc qui passe avant **et** après
la correction ne prouve rien. On annule la modification (`git stash`), on
relance le banc : il **doit** échouer. Puis on restaure.

---

## Étape 11 — Livrer

```bash
npm run typecheck
npm run build
npm run verify:all
```

Puis le rituel : `todo.md`, `CHANGELOG.md` complété côté utilisateur,
`buildNumber` bumpé, commit, push.

---

## Aide-mémoire du scénario

- **`Composants3D.svg`, en millimètres.** Le dessin reste un plan de découpe.
- **Le séparateur décimal est le POINT.** Une virgule de trop et la pièce
  retombe au centre, sans erreur.
- **`pos` est le CENTRE de la pièce**, et l'écart entre deux pièces est de
  centre à centre : `pos = (entrefer + épaisseur) / 2`.
- **`miroir` se met sur la NORMALE du plan** : `x` pour un `flanc`, `z` pour un
  `dessus`, `y` pour une `face`.
- **Une pastille rouge est une articulation.** Son premier mot dit à quoi elle
  s'emboîte ; le reste ne sert qu'à distinguer.
- **Une pièce ronde et rouge se trace en chemin**, jamais en cercle.
- **Une image détourée donne son contour à la pièce.**
- La couleur vient du **dessin**, pas de l'étiquette. `mat=` ne sert qu'aux
  pièces non remplies.
- **`npm run montre <préfixe>` est la boucle de travail** : redessiner,
  ↻ recharger, regarder.
- Lisez la sortie de la lecture **avant** de suspecter le dessin : elle dit
  déjà ce qui cloche.
