# Dessiner les systèmes en volume (araignée, pattes, plaques)

Le robot araignée et sa patte ne sont pas des SVG posés à l'écran : ce sont des **volumes calculés à chaque image** par le moteur isométrique [`iso3d.mts`](../../src/webview/composants/iso3d.mts). C'est ce qui permet à une patte de se lever pour de bon — un dessin plat, lui, donnait la même image qu'on tourne la hanche ou qu'on plie le genou.

Ce guide décrit : **vous dessinez le contour d'une pièce, le moteur le met en volume**. Le dessin reste de votre main, la cinématique, l'ombrage et le tri en profondeur restent au moteur.

Il y a **deux façons** de dessiner, et le guide les traite dans l'ordre :

| | Ce que vous dessinez | Ce que ça donne | Pour |
| --- | --- | --- | --- |
| **Profil** | **une** pièce à plat, à l'échelle libre | la pièce, mise aux cotes par le composant | une silhouette : le châssis du robot, un os de patte, une carte |
| **Assemblage** | **plusieurs** pièces à plat, **en millimètres**, chacune avec sa pose | le montage complet, cotes conservées | un corps en sandwich : deux flancs de 3 mm, les servos entre eux |

La différence tient en une phrase : dans un profil, seules les **proportions** comptent ; dans un assemblage, **les cotes sont l'information même** — entre deux flancs, 3 mm d'épaisseur et 25 mm d'entrefer ne se recalculent pas, ils se mesurent.

Ce guide s'adresse à qui travaille sur **le dépôt**. Pour un composant plat classique (une diode, un capteur), la chaîne est différente et décrite dans [Créer un composant Kablix](Creating-components.md).

Pressé ? Sautez à [dessin d'origine, ce que ça donne](#dessin-dorigine-ce-que-ca-donne) : trois images valent la page. Vous venez pour le corps en sandwich ? C'est [Assembler plusieurs pièces](#assembler-plusieurs-pieces). Vous butez sur une patte qui ne se monte pas comme vous vouliez ? C'est [Dessiner une patte, de la hanche au pied](#dessiner-une-patte-de-la-hanche-au-pied), et son tableau des symptômes.

---

## Ce qu'il faut avoir

- Le dépôt cloné, `npm install` passé, Node 20+.
- **Inkscape** (ou tout éditeur SVG) pour dessiner dans `Composants3D.svg`.
- **Chrome / Chromium** installé : la lecture des contours passe par un navigateur sans interface. Aplatir à la main des courbes de Bézier et des arcs elliptiques en Node serait du code faux à écrire deux fois — `getPointAtLength` le fait juste, et gratuitement.

### Deux planches, pas une

Les dessins d'origine vivent sur **deux** planches A3 à la racine du dépôt :

| Planche | Ce qu'on y dessine | Qui la lit |
| --- | --- | --- |
| `Composants2D.svg` | les composants **plats** de la bibliothèque : dessin externe et schéma interne d'une diode, d'un relais, d'un transistor | `node scripts/_extract-composants.mjs` |
| `Composants3D.svg` | les pièces à mettre **en volume** : profils, assemblages, le robot araignée | `npm run profil`, `npm run assemblage`, `npm run montre` |

Ce guide ne parle que de la **seconde**. Les outils la choisissent tout seuls ; `--source=` sert à lire une planche à part (les exemples de ce guide viennent de `docs/exemples/`). L'ancienne planche unique `Composants.svg` reste lue en repli tant qu'elle est là : rien ne casse pendant la scission.

---

## La chaîne en un coup d'œil

**Un profil** — une pièce, à l'échelle libre :

| # | Étape | Commande / fichier |
| --- | --- | --- |
| 1 | Dessiner le contour de la pièce | `Composants3D.svg`, groupe `<nom>-profil` |
| 2 | Le lire | `npm run profil <nom>` → `src/webview/composants/profils.mts` |
| 3 | Le regarder | `node scripts/_capture-profil.mjs <nom>:plat` puis `<nom>:plaque` ou `<nom>:piece` |
| 4 | Le mettre en volume | rien à faire si le nom est déjà attendu (tableau plus bas), sinon l'élément |
| 5 | Contrôler | `npm run verify:profils` |

**Un assemblage** — plusieurs pièces, en millimètres :

| # | Étape | Commande / fichier |
| --- | --- | --- |
| 1 | Dessiner les pièces, chacune avec son **étiquette de pose** | `Composants3D.svg`, groupes `<assemblage>-<pièce>` |
| 2 | Le lire et **le regarder tourner** | `npm run montre <préfixe>` |
| 3 | Le ranger seul (sans ouvrir de fenêtre) | `npm run assemblage <assemblage>` → `src/webview/composants/assemblages.mts` |
| 4 | En tirer les images de la doc | `node scripts/_capture-profil.mjs <assemblage>:assemblage` et `:eclate` |
| 5 | Contrôler | `npm run verify:assemblage` |

L'étape 4 des profils est vide dans le cas courant : les composants **cherchent déjà** leurs profils par leur nom et retombent sur la forme codée en dur tant que le dessin n'existe pas. Dessiner `araignee-chassis` puis l'extraire suffit à changer la silhouette du robot, sans toucher une ligne de TypeScript.

Côté assemblage, `npm run montre` fait les étapes 1 à 3 d'un coup : il relit le dessin, le range, et ouvre la scène dans une fenêtre où vous la tournez. C'est **la** boucle de travail — on redessine dans Inkscape, on clique **↻ recharger**, on regarde. Donnez-lui un préfixe et c'est le robot entier qui monte d'un coup.

---

## Ce qu'est un profil

Un **profil**, c'est le contour d'une pièce **à plat**, comme sur un plan de découpe laser : la silhouette, plus les perçages. Le moteur en tire un volume de deux façons, et deux seulement.

| Mise en scène | Le dessin est vu | Le volume obtenu | Fonction |
| --- | --- | --- | --- |
| **Plaque** | de **dessus** | contour extrudé **vers le haut**, sur son épaisseur | `prismFaces` |
| **Pièce** | de **côté**, couchée | contour posé **entre deux points**, sur son épaisseur | `extrudeProfile` |

Une plaque, c'est le châssis du robot, une platine, une équerre posée à plat. Une pièce, c'est un os de patte, un bloc de servo, une bielle : quelque chose qui va **d'une articulation à l'autre** et qui suit le mouvement.

Les perçages, eux, ne sont pas creusés dans la matière : ils sont posés en **décalques sombres** sur la face qu'on voit (`decalFaces`). L'image est la même, et le découpage d'un polygone à trous — qui n'apporterait rien ici — est évité.

---

## Le repère : où va le haut du dessin

C'est la seule chose qu'on ne peut pas deviner à votre place, et c'est la première à regarder quand un dessin ne donne pas ce qu'on attendait.

### Le repère du monde

**X vers la droite, Y vers l'arrière, Z vers le haut.** C'est le repère du moteur, et c'est celui que vous voyez dessiné dans un coin de **toutes** les images en volume de ce guide, ainsi que dans le visualiseur (case **repère X Y Z**). Il tourne avec la scène : quand vous faites pivoter le robot, le repère pivote aussi, et il dit à tout moment où est l'avant.

![Le repère du monde, et le x / y de chacun des trois plans](../img/systemes/repere.webp)

La même pièce en L, posée dans les trois plans. Les flèches **violette** et **orange** sont le `x` et le `y` **de votre feuille de dessin** ; la grise est le sens de l'épaisseur.

| Plan | Le dessin est vu | `x` du dessin part | `y` du dessin part | L'épaisseur part | Exemples |
| --- | --- | --- | --- | --- | --- |
| `dessus` | de dessus, **avant en haut** | vers la droite | vers l'**arrière** | verticalement | plaques, platines, ponts |
| `flanc` | de côté, **avant à gauche** | vers l'**arrière** | vers le **bas** | en travers du robot | les deux flancs, un servo couché |
| `face` | de face | vers la droite | vers le **bas** | d'avant en arrière | cloison, entretoise, capot avant |

Deux façons de le retenir, et elles suffisent :

- **La vue de dessus garde son sens de plan** : le haut de la feuille est l'avant du robot, comme sur n'importe quel plan vu de dessus.
- **Les deux autres se relèvent telles quelles** : le dessin est mis debout **exactement comme il est tracé**, le haut de la feuille vers le haut. Ce que vous dessinez en haut est en haut, ce que vous dessinez à gauche est vers l'avant (`flanc`) ou vers la gauche (`face`).

Le `y` d'un dessin SVG **descend** — c'est ce qui explique la colonne « vers le bas » du tableau, et pourquoi une pièce dessinée vers le bas de la feuille finit en bas du robot.

### Le haut du dessin, pour un profil

- **Plaque** : dessinée **vue de dessus**, le **haut du dessin est l'avant** du robot.
- **Pièce** : dessinée **vue de côté, couchée à l'horizontale**. Le **bord gauche** du dessin tombe sur la première articulation, le **bord droit** sur la seconde. Le haut du dessin reste en haut.

Deux conséquences qui évitent bien des surprises :

1. **Les cotes du dessin ne comptent pas, ses proportions si.** Une plaque est ramenée au diamètre du châssis ; une pièce est mise à l'échelle **en bloc** (longueur *et* hauteur par le même facteur) pour aller d'une articulation à l'autre. Le même fémur sert donc à la patte seule et aux pattes du robot, plus longues, sans s'y déformer. Dessinez à une taille confortable, pas à une taille « juste ».
2. **Le centrage est automatique**, sur le milieu de la boîte englobante. Inutile de caler votre dessin sur l'origine de la planche.

Les coordonnées rangées sont en **pixels de la grille 10 px** du canevas. Si votre planche Inkscape est en millimètres — c'est le cas de `Composants3D.svg` — la conversion est faite au passage.

---

## Dessiner le profil

Dans `Composants3D.svg`, la planche A3 des pièces à mettre en volume :

- **Un profil = un groupe (ou un simple chemin) dont l'`id` est `<nom>-profil`.** Le nom sans suffixe est accepté en repli, mais le suffixe évite de confondre un profil avec le dessin plat d'un composant du même nom.
- **Un contour fermé pour la pièce.** Les contours **entièrement contenus** dedans sont ses **trous** (perçages, allègements). Un contour qui n'est ni la pièce ni contenu dedans est signalé et ignoré — deux pièces dans le même groupe, c'est un dessin à corriger, pas une devinette à trancher.
- **Le contour ne doit pas se croiser.** Une silhouette en 8, un bord replié sur lui-même : le découpage n'a alors pas de sens et `verify:profils` le refuse.
- **Les courbes sont admises** : Bézier, arcs, cercles, rectangles, polygones. Tout est aplati puis simplifié — un cercle échantillonné finit à une trentaine de points, pas deux cents.
- **Le sens de tracé est indifférent** (horaire ou trigonométrique) : il est normalisé à la lecture.
- **Les pastilles rouges ne font pas partie du contour** — mais une pastille **nommée** est rangée avec la pièce : c'est une articulation (`hanche`, `genou`), et deux pastilles de même préfixe font un **axe de rotation**. Voir [Les axes](#les-axes) : la convention est celle des assemblages, à l'identique. Une pastille anonyme et les textes restent de simples repères de planche, ignorés.

> Le piège classique est le **contour qui recule**. Sur le châssis d'exemple, l'encoche avant a d'abord été tracée plus large que les épaules qui l'encadrent : le tracé repartait en arrière et se repliait sur lui-même. Les bords d'une encoche se posent **sur** le cercle du corps, jamais au-delà.

Les noms que le code cherche déjà — les dessiner suffit, il n'y a rien à brancher :

| Nom du groupe | Pièce | Mise en scène | Repli sans dessin |
| --- | --- | --- | --- |
| `araignee-chassis` | plaque du robot araignée | plaque | octogone à 8 pans |
| `araignee-picow` | carte Pico W posée sur le dos du robot | plaque | pavé 46 × 18 |
| `araignee-pca9685` | carte 16 servos, sur la plaque | plaque | pavé 40 × 24 |
| `araignee-batterie` | pack d'accus, sur la plaque | plaque | pavé 34 × 18 |
| `patte-femur` | os hanche → genou | pièce | pavé |
| `patte-tibia` | os genou → pied | pièce | pavé |

> **L'électronique embarquée est retouchable comme le reste** . Chaque carte se dessine **vue de dessus, connecteur à gauche** : le contour est mis à l'échelle sur sa **longueur** (46, 40 ou 34 unités de scène), ses perçages sont posés en décalques d'une teinte assombrie de la carte, et sa **place sur la plaque ne change pas** — c'est le code qui la tient, pour que rien ne se chevauche. Sur la Pico W, le blindage radio et la prise USB restent posés dessus par le code.

---

## Le lire

```bash
npm run profil araignee-chassis patte-femur     # = node scripts/_extract-profils.mjs
```

Sortie :

```text
  ✓ araignee-chassis : 24 points, 112.4×110.8 px, 5 trou(s)
  ✓ patte-femur : 30 points, 73.83×13.98 px, 2 trou(s)

  → src/webview/composants/profils.mts (3 profil(s))
```

| Option | Effet |
| --- | --- |
| `--list` | Affiche ce qui est déjà rangé, sans rien lire ni écrire. |
| `--source=chemin.svg` | Lit un autre fichier que `Composants3D.svg` (les exemples de ce guide viennent de `docs/exemples/`). |
| `--step=0.35` | Pas d'échantillonnage des courbes, en unités du dessin. Plus fin que l'œil par défaut. |
| `--tol=0.25` | Tolérance de simplification, en pixels de grille. En dessous, un point ne change plus la silhouette et ne fait qu'alourdir le rendu. |

Le module produit, `src/webview/composants/profils.mts`, **est sa propre archive** : l'outil le relit avant de le réécrire, donc extraire un seul profil ne fait pas disparaître les autres. Il se lit et se relit dans un `git diff` — c'est du dessin versionné — mais **ne se modifie pas à la main** : la prochaine extraction écraserait la retouche.

---

## Le mettre en volume

Un composant demande son profil par son nom et retombe sur sa forme codée en dur s'il n'existe pas encore. C'est tout le branchement, et il tient en trois lignes. Pour un os de patte ([`patte-element.mts`](../../src/webview/composants/patte-element.mts)) :

```ts
function bone(name: string, a: Vec3, b: Vec3, t: number): Face[] {
  if (!hasProfile(name)) return boxFaces(a, b, t, t, COLORS.bone);
  const p = profile(name);
  return extrudeProfile(p, a, b, t, COLORS.bone, p.holes);
}
```

Pour une plaque ([`araignee-element.mts`](../../src/webview/composants/araignee-element.mts)), le contour est en plus ramené au diamètre attendu et tourné du lacet de présentation, **pour que le dessin décide de la silhouette et non des cotes** : hanches, pattes, cartes et bornier restent là où le reste du composant les attend.

```ts
const plate = prismFaces(outline.poly, CHASSIS.height, CHASSIS.height + CHASSIS.thickness, COLORS.chassis);
const faces = [
  ...plate,
  ...outline.holes.flatMap((h) => decalFaces(h, CHASSIS.height + CHASSIS.thickness, '#8fb3c4', plate)),
];
```

Trois détails du moteur qui expliquent le reste du code :

1. **Toutes les faces de la scène sont triées ensemble**, du plus loin au plus près (algorithme du peintre). Trier chaque pièce séparément casserait l'illusion : c'est le tri commun qui fait passer une patte arrière derrière la plaque et la patte avant devant.
2. **Les grandes faces sont recoupées** en morceaux de taille comparable. Une face est rangée à sa profondeur **moyenne** : une plaque entière d'un seul tenant passerait devant — ou derrière — tout ce qu'elle porte, et le Pico posé sur son bord disparaissait sous elle.
3. **Un décalque est rangé juste devant la face qui le porte**, pas simplement soulevé de quelques dixièmes : la plaque est faite de dizaines de triangles, et ceux du bord arrière passent devant ce qui est au centre. Rien d'autre n'est masqué pour autant — une patte qui survole la plaque reste bien plus près de l'œil que n'importe quel morceau de celle-ci.

---

## Dessin d'origine, ce que ça donne

Deux exemples complets, l'un de chaque sorte. Les dessins sont dans [`docs/exemples/`](../exemples/), les profils rangés sous les noms `chassis-demo` et `femur-demo`, et **les images de droite sont produites par le vrai moteur** — jamais par une capture d'écran.

### Une plaque : `chassis-demo`

| Le dessin | Ce que le lecteur en a compris | Ce que le moteur en fait |
| --- | --- | --- |
| ![Dessin d'origine du châssis](../exemples/chassis-demo.svg) | ![Contour relu, sur la grille de 10 px](../img/systemes/chassis-demo-plat.webp) | ![Le châssis en volume](../img/systemes/chassis-demo.webp) |
| Vue de dessus : quatre bras à ±45°, une encoche en V à l'avant, cinq perçages. Tracé dans un éditeur SVG, `fill-rule: evenodd`. | 20 points (les pastilles rouges), 106×106 px. Les courbes ont été aplaties puis simplifiées ; les cinq perçages ont été reconnus comme trous parce qu'ils sont **contenus** dans la pièce. | `prismFaces` extrude le contour sur 8 px d'épaisseur, `decalFaces` pose les perçages sur le dessus. L'encoche est bien creuse : on voit le fond à travers. |

### Une pièce : `femur-demo`

| Le dessin | Ce que le lecteur en a compris | Ce que le moteur en fait |
| --- | --- | --- |
| ![Dessin d'origine du fémur](../exemples/femur-demo.svg) | ![Contour relu, sur la grille de 10 px](../img/systemes/femur-demo-plat.webp) | ![Le fémur en volume](../img/systemes/femur-demo.webp) |
| Vue de côté, pièce couchée : deux têtes rondes, un corps aminci, deux trous d'axe. Le bord gauche ira sur la première articulation, le bord droit sur la seconde. | 30 points, 73,83×13,98 px. Le corps aminci tient en quelques points, les têtes rondes en une dizaine chacune. | `extrudeProfile` couche la pièce entre les deux articulations et l'épaissit de 10 px. Les trous d'axe sont posés **sur les deux flancs** : la pièce se lit percée de part en part. |

Le rendu du milieu — le mode `:plat` — est le **premier endroit où regarder** quand un tracé donne un volume inattendu. Il montre exactement ce que le lecteur a retenu : le contour, ses trous, et un point rouge par sommet gardé. Un contour qui se replie s'y voit tout de suite.

---

## Regarder et contrôler

Les trois mises en scène du script de capture :

```bash
node scripts/_capture-profil.mjs chassis-demo:plat     # le contour relu, sur la grille
node scripts/_capture-profil.mjs chassis-demo:plaque   # extrudé vers le haut
node scripts/_capture-profil.mjs femur-demo:piece      # couché entre deux articulations
```

Les images sortent dans `docs/img/systemes/`, sur fond transparent, en WebP. `--width=720` donne une image plus grande pour examiner un rendu douteux de près.

Puis le banc :

```bash
npm run verify:profils
```

C'est du **calcul pur** — pas de navigateur, moins d'une seconde. Il contrôle le moteur (le découpage couvre toute l'aire, aucun triangle ne sort de la forme, aucune face démesurée, un décalque passe devant sa plaque, une pièce va bien d'une articulation à l'autre) **puis chaque profil rangé** : contour exploitable, cotes cohérentes, centrage, découpage complet et entièrement intérieur, chaque perçage dans la pièce. Une contre-épreuve termine la liste : un contour qui se croise doit **échouer**, sinon le banc ne prouverait rien.

---

## Assembler plusieurs pièces

Un profil ne dit qu'une chose : une silhouette. Il ne sait pas dire **où** est la pièce par rapport à une autre, et c'est exactement ce qu'il faut pour un **corps en sandwich** : deux flancs de PMMA de 3 mm, les servos de hanche serrés entre eux, une entretoise à l'avant. Sur la planche à plat, rien de tout cela ne se voit — et une image fixe ne dit pas si les servos passent.

Un **assemblage** répond à ça. C'est un jeu de pièces plates, **en millimètres**, chacune portant sa **pose** écrite en clair dans le dessin. Le dessin reste ce qu'il doit rester : un **plan de découpe laser**, avec les pièces posées côte à côte sur la planche. Ce n'est pas leur place sur la planche qui compte, c'est leur étiquette.

### Le dessin

Dans `Composants3D.svg` (ou une planche à part, voir `--source=`) :

- **Une pièce = un groupe dont l'`id` commence par le nom de l'assemblage**, suivi du nom de la pièce : `araignee-corps-flanc`, `araignee-corps-servo`. Le suffixe `-profil` reste toléré (`araignee-corps-flanc-profil`) ; le nom retenu est ce qui suit le nom de l'assemblage.
- **La planche doit être en millimètres.** `Composants3D.svg` l'est déjà (`width="…mm"` et un `viewBox` du même nombre : 1 unité = 1 mm). Une planche en pixels CSS est convertie, mais vous ne saurez plus ce que vous cotez.
- **Un texte dans le groupe donne la pose** : `flanc pos=28,0,0 ep=12 mat=servo miroir=x`. C'est un simple `<text>`, posé où vous voulez dans le groupe — sous la pièce se lit bien.
- **Le contour, les trous et les courbes** suivent exactement les règles d'un profil (contour fermé, trous contenus dedans, pas de tracé qui se croise).
- **Une pastille rouge nommée = un axe.** Son **id Inkscape** la nomme, à défaut le texte **au-dessus** d'elle, et son centre devient un point 3D de l'assemblage. Deux pastilles de même préfixe font un **axe de rotation** ([détail](#les-axes)).

### L'étiquette de pose

Un mot de plan, puis des `clé=valeur` dans n'importe quel ordre :

```text
flanc pos=28,0,0 ep=12 mat=servo miroir=x
```

| Mot | Rôle | Défaut |
| --- | --- | --- |
| `dessus` / `flanc` / `face` | **obligatoire, en premier** : comment le dessin se pose | — |
| `pos=x,y,z` | centre de la pièce dans le repère de l'assemblage, en mm | `0,0,0` |
| `ep=3` | épaisseur de la pièce, en mm | `3` |
| `mat=pmma` | matière — **seulement pour une pièce sans remplissage** : la couleur du dessin prime | `pmma` |
| `miroir=x` | la pièce est posée **deux fois**, symétriquement | pas de miroir |

`miroir` seul (sans `=`) vaut `miroir=y`. Une valeur inconnue (`mat=titane`, `pos=3,4`) est ignorée et la valeur par défaut s'applique : la pièce apparaît alors visiblement fausse, plutôt que muette.

#### Le séparateur décimal est le POINT

C'est le piège numéro un de l'étiquette, parce qu'il ne se voit pas sur l'image : le pavé numérique français tape une virgule, or la virgule sépare déjà les trois coordonnées.

```text
dessus pos=24,501,-38,083,0 ep=21,5     ← cinq nombres au lieu de trois : illisible
dessus pos=24.501,-38.083,0 ep=21.5     ← juste
```

Une étiquette illisible ne fait pas d'erreur : la pièce **retombe au centre, à 3 mm d'épaisseur**. Elle est bien là, simplement pas où vous croyez. La lecture le dit maintenant en clair :

```text
  ! araignee-patte-tibia-servo : « pos=24,501,-38,083,0 » illisible, pièce remise au centre
    — le séparateur décimal est le POINT : pos=24.501,-38.083,0
```

Même chose pour un mot inconnu ou une matière inconnue : chacun se signale à la lecture. **Lisez la sortie de `npm run montre` avant de suspecter le dessin.**

### Les trois plans

Le tableau et la figure sont plus haut, dans [Le repère du monde](#le-repère-du-monde) : ce sont exactement les mêmes trois plans, et la figure montre le `x` et le `y` de la feuille pour chacun.

En deux phrases : **`dessus` garde le sens d'un plan vu de dessus** (haut de la feuille = avant du robot) ; **`flanc` et `face` relèvent le dessin tel qu'il est tracé** (haut de la feuille = haut du robot).

**Une pièce est posée par son CENTRE** (le milieu de sa boîte englobante) : `pos` est donc le centre de la pièce, pas son coin. C'est ce qui rend le miroir immédiat — un flanc à `pos=0,-9,0` avec `miroir=y` donne les deux flancs, écartés de 18 mm.

### Les couleurs : c'est le dessin qui décide

**La pièce a en volume la couleur qu'elle a sur la planche**, transparence comprise. Vous remplissez un flanc de PMMA en bleu à 55 %, vous le voyez bleu et vous voyez au travers ; vous peignez une carte en vert foncé, elle est vert foncé. Rien à écrire dans l'étiquette : la couleur est déjà dans le dessin, c'est la seule chose que le moteur relit.

Quelques détails qui évitent les surprises :

- C'est le remplissage **effectif**, celui que le navigateur calcule : `fill`, `fill-opacity`, et l'opacité de tous les groupes qui portent la forme — Inkscape pose souvent la transparence sur le calque, pas sur la pièce.
- La couleur retenue est celle de la **plus grande forme remplie** du groupe : c'est le contour de la pièce. Un perçage, un repère ou un texte ne décide pas de la teinte du tout.
- Une pièce **sans remplissage** (un contour de découpe, tracé au trait seul) n'a pas de couleur à donner : c'est alors `mat=` qui répond, ou le PMMA par défaut.

`mat=` reste donc utile pour une pièce qui n'est pas peinte, ou pour forcer une teinte sans toucher au plan de découpe :

| `mat=` | Couleur | Pour |
| --- | --- | --- |
| `pmma` | bleu clair | le PMMA découpé au laser — c'est le défaut |
| `alu` | gris clair | équerres, entretoises métalliques |
| `servo` | noir | un servo, un moteur, un bloc plein |
| `carte` | vert | un circuit imprimé |
| `laiton` | doré | visserie, entretoises filetées |
| `pile` | gris ardoise | accus, pack de batteries |

Le mot dit la couleur, et rien d'autre : aucune simulation, aucune masse.

**Une matière translucide n'a pas de liseré.** Une plaque est découpée en dizaines de triangles ; sur chaque arête intérieure, le liseré qui bouche les coutures se recouvre lui-même. Opaque, cela ne se voit pas ; translucide, cela dessinerait une toile d'araignée sur toute la pièce. Le liseré est donc retiré dès que la couleur est transparente.

### Les axes

Une **pastille rouge** dans le groupe d'une pièce marque un point remarquable : un axe de hanche, un genou, un pivot. Ses coordonnées sont calculées **dans le repère de l'assemblage**, pose comprise.

Deux façons de la nommer, dans cet ordre :

1. son **ID Inkscape** — sélectionnez le rond, `Objet → Propriétés de l'objet`, écrivez `hanche-g-int` ;
2. à défaut, le **texte libre le plus proche**, celui du dessus étant préféré — exactement comme le nom d'une broche sur la planche des composants.

L'ID passe devant parce qu'il **colle au rond** : il survit à un déplacement, à un texte ajouté à côté, et il n'encombre pas la planche de quatre étiquettes quand la pièce porte quatre pastilles. Un id qu'Inkscape a fabriqué tout seul (`circle91`, `path102`) ne nomme rien : la pastille est alors **ignorée**, avec un avertissement à la lecture.

C'est le point important du protocole : **c'est le dessin qui dit où est la hanche**, plus une constante du code. Déplacez le trou dans Inkscape, l'axe suit.

#### Le nom d'une pastille se lit en deux morceaux

Tout tient dans une seule phrase, et le reste de cette section n'en est que le détail :

> **`famille - articulation - bout`** — le **premier** segment est la **famille** (elle dit *à quoi ça s'emboîte*), tout sauf le **dernier** est le **préfixe** (il dit *quelle* articulation), le dernier ne sert qu'à distinguer les **deux bouts** de l'axe.

| Nom de la pastille | Préfixe = l'articulation | Famille = ce à quoi ça s'emboîte |
| --- | --- | --- |
| `hanche-ag-h` | `hanche-ag` | `hanche` |
| `hanche-ag-b` | `hanche-ag` | `hanche` |
| `hanche-rd-h` | `hanche-rd` | `hanche` |
| `genou-h` | `genou` | `genou` |
| `pied` | `pied` | `pied` |

#### Deux pastilles de même préfixe = un axe de rotation

Un point ne dit pas autour de **quoi** on tourne. Deux points, si : **deux pastilles dont le nom ne diffère que par le dernier segment sont les deux bouts d'un même axe.**

```text
hanche-ag-h  ─┐
               ├─ axe « hanche-ag »  (famille « hanche »)
hanche-ag-b  ─┘
```

Le préfixe (`hanche-ag`) nomme l'axe, le dernier segment (`-h`, `-b`, `-ext`, `-int`…) ne sert qu'à distinguer les deux bouts. Le moteur en tire la **droite** : son milieu, sa direction, la distance entre les deux pastilles. Si plus de deux pastilles partagent un préfixe, ce sont les **deux plus éloignées** qui portent l'axe — et la lecture vous prévient, parce que c'est presque toujours une erreur de nommage.

Une pastille **seule** reste un simple point : elle marque un endroit (`pied`), elle ne dit pas autour de quoi tourner.

#### Quatre hanches = quatre préfixes = huit pastilles

C'est **le** piège, et il ne se voit pas sur l'image : quatre pattes se retrouvent l'une sur l'autre au milieu du corps.

```text
hanche-ag   ─┐
hanche-ad    │
hanche-rg    ├─ MÊME préfixe « hanche » : UNE articulation, UNE patte
hanche-rd   ─┘
```

Les quatre noms ne diffèrent **que par leur dernier segment** : la règle les lit donc comme les quatre bouts d'un **seul** axe. Le robot n'a qu'une hanche, au centre.

Quatre hanches distinctes veulent **quatre préfixes distincts**, donc des noms à **trois** segments — et comme chaque hanche mérite un axe, cela fait **deux pastilles chacune, huit en tout** :

```text
hanche-ag-h / hanche-ag-b     avant gauche
hanche-ad-h / hanche-ad-b     avant droite
hanche-rg-h / hanche-rg-b     arrière gauche
hanche-rd-h / hanche-rd-b     arrière droite
```

Les huit partagent la famille `hanche` : c'est ce qui fait qu'un fémur nommant `hanche` vient s'y poser — **quatre fois**, une par hanche.

> Le même piège existe en plus discret. Quatre pastilles nommées `hanche-g-h`, `hanche-g-b`, `hanche-d-h`, `hanche-d-b` ne se plaignent de rien : elles font proprement **deux** axes, `hanche-g` et `hanche-d`, chacun traversant le corps de l'avant à l'arrière. Deux axes, deux pattes. Ce n'est visible qu'en cochant **axes dessinés** dans le visualiseur : les deux traits rouges tiretés vont d'un bout à l'autre du corps au lieu d'être quatre petits segments verticaux.

#### Une famille partagée = deux dessins qui s'emboîtent

Les articulations ne servent pas qu'à faire tourner : **c'est par elles que les dessins se montent les uns sur les autres**, sans que vous ayez une seule cote à reporter.

La règle est courte :

1. Deux ensembles qui nomment la **même famille** s'emboîtent : le corps a des `hanche-…`, le fémur aussi → le fémur se pose sur le corps.
2. **Celui qui offre le plus d'articulations porte l'autre.** Le corps en a quatre, le fémur deux : c'est le corps qui porte, et il naît **quatre fémurs**.
3. **Les articulations sont superposées**, pastille sur pastille. La position ne se calcule pas, elle se lit dans le dessin.
4. Quand la famille compte **plusieurs** articulations (les quatre hanches), chaque exemplaire est **tourné vers la sienne** : les pattes s'écartent d'elles-mêmes. Quand elle n'en compte qu'**une** (le genou du fémur), l'enfant garde le cap de son parent : le tibia prolonge le fémur.

Une chaîne complète tient donc en trois dessins et six noms :

```text
araignee-corps          hanche-ag-h/-b  hanche-ad-h/-b  hanche-rg-h/-b  hanche-rd-h/-b
araignee-patte-femur    hanche-h/-b     ← s'emboîte sur le corps (famille « hanche »)
                        genou-h/-b      ← offre un genou
araignee-patte-tibia    genou-h/-b      ← s'emboîte sur le fémur (famille « genou »)
                        pied
```

Résultat à l'écran : **un corps, quatre fémurs, quatre tibias**, chacun à sa place, sans une ligne de code. C'est ce que fait `npm run montre araignee`.

Un ensemble qui ne partage aucune famille reste **à sa propre origine** : il n'est pas deviné, il est simplement posé. Et si aucun ensemble n'en partage avec un autre, le visualiseur le dit et retombe sur l'affichage côte à côte.

#### Un profil aussi

Une pièce dessinée seule (un profil) suit la **même convention** : ses pastilles nommées sont rangées avec son contour, dans le même repère centré. Quand le composant la pose entre deux articulations, `profileAxes` les emporte avec elle — à l'échelle, à sa place. Un genou dessiné sur le fémur reste le genou du fémur, qu'on allonge la patte ou non.

### Le regarder tourner

```bash
npm run montre araignee            # TOUT ce qui commence par « araignee »
npm run montre araignee-corps      # un seul assemblage
```

L'argument est un **préfixe**, pas un nom exact : l'outil ramasse dans la planche **tous les assemblages et tous les profils** qui commencent par là, et les montre **ensemble, à la même échelle**. La planche n'est lue qu'**une fois** pour tout le préfixe (la lecture passe par Chrome : c'est le temps d'attente, autant ne le payer qu'une fois).

**Demander le préfixe global, c'est demander le robot entier.** `npm run montre araignee` ne pose pas trois dessins côte à côte : il les **monte**, chacun sur les articulations du précédent, articulations superposées — un corps, quatre fémurs, quatre tibias. Trois dessins sur la planche, un robot à l'écran. C'est la case **monté sur ses articulations**, cochée par défaut ; décochez-la pour retrouver les dessins séparés.

Un profil, dessiné seul et sans cotes, est traité comme un assemblage d'une pièce : sa grille de 10 px devient des millimètres et il se pose à plat, 3 mm d'épaisseur, à côté des vrais assemblages.

Ce qui est lu est aussi **rangé** : `assemblages.mts` et `profils.mts` sont réécrits, exactement comme le feraient `npm run assemblage` et `npm run profils`.

| Dans la fenêtre | Ce que ça sert |
| --- | --- |
| Bouton **↻ recharger** | relire `Composants3D.svg` **sans quitter la fenêtre** : on retouche dans Inkscape, on clique, on regarde. L'angle, le zoom et les cases cochées sont conservés |
| **Glisser dans la vue** (ou le curseur *lacet*) | tourner autour : l'angle où ça coince n'est jamais celui de la première image |
| Curseur **éclaté** | écarter les pièces le long de leur épaisseur — le seul moyen de voir ce qu'il y a entre deux flancs serrés à 3 mm |
| Curseur **zoom** | regarder un détail de près |
| Case de titre **d'un ensemble** | masquer tout un assemblage — regarder le fémur seul sans relancer la commande |
| Case **×4** à droite du titre | l'ensemble a reçu quatre exemplaires (quatre hanches, quatre pattes). Décochez-la pour n'en garder qu'**un** : quatre pattes cachent le corps qu'on voulait voir. Ce qu'elle porte suit — un seul fémur ne tient qu'un tibia |
| Cases **pièces** | cacher un flanc pour voir dedans |
| Case **axes dessinés** | montrer les pastilles nommées à leur place en 3D, et les **axes de rotation** en trait rouge tireté |
| Case **repère X Y Z** | le repère du monde dans un coin, tourné avec la scène : il dit à tout moment où est l'avant |
| Case **monté sur ses articulations** | **le robot assemblé** : chaque ensemble posé sur les articulations du précédent, articulations superposées, un exemplaire par articulation. Décochée, on retombe sur les dessins séparés |
| Case **côte à côte** (démontée seulement) | décochée, chaque ensemble reprend sa **propre origine** — sa place à lui, telle qu'il est dessiné |

Le panneau affiche l'**encombrement en millimètres** (`100 × 80 × 31 mm`) : c'est la cote qu'on lit sur un plan de montage, et le premier signe qu'une pièce est posée de travers.

Les options : `--source=docs/exemples/corps-demo.svg` pour lire une autre planche, `--sans-lire` pour rouvrir sur ce qui est déjà rangé (quand seul le moteur a changé), `--sans-ranger` pour regarder sans réécrire les modules générés, `--sans-ouvrir` pour servir la page sans lancer de fenêtre, `--port=8731` pour choisir le port.

### Dessin d'origine, ce que ça donne

L'exemple complet est dans [`docs/exemples/corps-demo.svg`](../exemples/corps-demo.svg) : un corps de robot en sandwich, **trois pièces dessinées** qui en font **cinq** une fois posées.

| Le dessin | Assemblé | Éclaté |
| --- | --- | --- |
| ![Le plan de découpe du corps de démonstration](../exemples/corps-demo.svg) | ![Le corps assemblé](../img/systemes/corps-demo.webp) | ![Le même corps, éclaté](../img/systemes/corps-demo-eclate.webp) |
| Trois groupes posés côte à côte, comme un plan de découpe : la plaque (`dessus pos=0,0,14 ep=3 miroir=z`), le servo (`flanc pos=28,0,0 ep=12 mat=servo miroir=x`), l'entretoise (`face pos=0,-36,0 ep=3`). | Les deux plaques à 14 mm de part et d'autre du plan médian : 25 mm d'air entre elles, juste ce qu'il faut pour un servo couché. Encombrement : 100 × 80 × 31 mm. | Chaque pièce écartée le long de son épaisseur. Les servos apparaissent : c'est cette vue qui répond à « est-ce que ça rentre ? ». |

Le PMMA du plan est rempli **à 55 %** : les plaques sont translucides en volume, et les servos se voient au travers sans même avoir à éclater le corps. Le servo, lui, est peint en gris sombre sur la planche — son `mat=servo` ne sert plus à rien, et c'est bien ainsi : le plan de découpe se suffit.

Les deux images de droite sont produites par le vrai moteur :

```bash
node scripts/_capture-profil.mjs corps-demo:assemblage corps-demo:eclate
```

### Le ranger et le contrôler

```bash
npm run assemblage araignee-corps      # lit et range, sans ouvrir de fenêtre
npm run assemblage -- --list           # ce qui est déjà rangé
npm run verify:assemblage              # le banc
```

Sortie de la lecture :

```text
  ✓ entretoise : 5 points, 40×25 mm, face ép.3 #bcdff08c
  ✓ plaque : 10 points, 100×80 mm, dessus ép.3 #bcdff08c miroir=z, 3 trou(s)
  ✓ servo : 5 points, 23×23 mm, flanc ép.12 #3f4750ff miroir=x, 1 trou(s)
  → corps-demo : 3 pièce(s), 4 axe(s), 100×80×31 mm
```

Quatre pastilles, deux par deux : `hanche-g-ext` / `hanche-g-int` et `hanche-d-int` / `hanche-d-ext`, soit les **deux axes de rotation** des hanches. Une pastille anonyme se signale à cette ligne-là (`! …-supports : pastille sans nom (id « circle91 »), ignorée`) : c'est le moment de lui donner un id dans Inkscape.

La couleur affichée est celle qui a été **lue sur le dessin** (`#rrggbbaa`, transparence comprise) — `8c` en fin de ligne, c'est le PMMA à 55 %. Une pièce non peinte affiche à la place le mot de son `mat=`.

`src/webview/composants/assemblages.mts` est **généré**, et il est **sa propre archive** : l'outil le relit avant de le réécrire, extraire un assemblage ne fait pas disparaître les autres. Comme `profils.mts`, il se lit dans un `git diff` mais ne se modifie pas à la main.

Le banc `verify:assemblage` est du calcul pur, comme celui des profils. Il éprouve la **lecture de l'étiquette** (une position négative doit rester entière — `pos=0,-9,0` a déjà été lu comme trois mots), les **plans** (une plaque de 100 mm posée à plat encombre 100 × 80 × 3, jamais 103 × 83 × 35), le **miroir**, l'**éclaté** (chaque pièce s'écarte du côté où elle est déjà, une pièce centrale ne bouge pas), puis **chaque assemblage rangé** : plan et matière connus, contour centré, cotes conformes, encombrement conforme au calcul, axes dans la boîte. Il éprouve aussi les **couleurs lues sur le dessin** — la teinte du dessin passe devant `mat=`, la transparence traverse l'éclairage sans s'y perdre, et une face translucide sort sans liseré — et les **axes de rotation** : la règle du préfixe, les deux pastilles les plus éloignées quand il y en a trois, deux pastilles superposées qui ne font pas une droite, et les pastilles d'un profil qui suivent la pièce quand on l'allonge.

Il éprouve enfin le **montage** sur un robot d'essai — un corps à quatre hanches, un fémur, un tibia : c'est le corps qui porte (il offre le plus d'articulations), il naît quatre fémurs et quatre tibias, chacun sur une hanche différente, hanches et genoux **superposés au millimètre**, les quatre pattes tournées vers quatre caps distincts, le tibia gardant le cap de son fémur. Un ensemble qui ne partage aucune famille reste à sa place, et deux dessins sans rien en commun ne montent rien du tout plutôt que d'inventer.

---

## Dessiner une patte, de la hanche au pied

Le cas complet, celui qui met tout ce qui précède bout à bout : un corps, un fémur, un tibia, et **quatre pattes** à l'arrivée. Trois dessins seulement — les quatre exemplaires ne se dessinent pas, ils naissent des quatre hanches.

### 1. Trois groupes, trois assemblages

```text
araignee-corps-…          le corps : plaques, cartes, batterie
araignee-patte-femur-…    l'os hanche → genou, et le servo de genou qu'il porte
araignee-patte-tibia-…    l'os genou → pied
```

Chacun se dessine **où vous voulez sur la planche**, côte à côte comme un plan de découpe. Ce n'est pas leur place sur la planche qui compte : c'est leur étiquette de pose, et leurs pastilles.

### 2. Le corps : huit pastilles, quatre hanches

Sur la pièce qui porte réellement les servos de hanche (les flancs, pas la plaque du dessus), quatre paires de pastilles rouges :

```text
hanche-ag-h  hanche-ag-b        avant gauche
hanche-ad-h  hanche-ad-b        avant droite
hanche-rg-h  hanche-rg-b        arrière gauche
hanche-rd-h  hanche-rd-b        arrière droite
```

Les deux pastilles d'une paire sont **les deux bouts de l'axe** du servo : si la hanche tourne en lacet (le servo est debout), l'une est au-dessus de l'autre ; si elle tourne en roulis, elles sont l'une derrière l'autre. **Posez-les où l'axe passe vraiment** — c'est cette droite que la patte suivra.

Nommez-les par leur **id Inkscape** (`Objet → Propriétés de l'objet`) : huit textes sur la planche seraient illisibles.

### 3. Le fémur : deux articulations, pas une

C'est ici que ça coince le plus souvent. Le fémur porte **deux** articulations, et il lui faut les deux :

| Pastilles | À quoi elles servent |
| --- | --- |
| `hanche-h`, `hanche-b` | **là où le fémur s'accroche au corps.** Famille `hanche` : c'est le mot que le corps emploie aussi, et c'est tout ce qu'il faut pour qu'ils s'emboîtent |
| `genou-h`, `genou-b` | **l'axe que le fémur offre au tibia.** Famille `genou` |

Un fémur qui n'a que sa hanche se pose bien sur le corps — mais le tibia n'a plus rien à quoi s'accrocher, et il reste tout seul dans son coin. **Le genou se dessine sur le fémur**, pas seulement sur le tibia.

Le fémur est un `flanc` : dessiné de côté, il se relève **tel qu'il est tracé**. Ce que vous dessinez en haut sera en haut du robot. Si la patte part à l'envers, c'est le dessin qui est retourné, pas le moteur — cochez **repère X Y Z** et regardez où pointe le Z.

### 4. Le tibia : le genou, et le pied

```text
genou-h  genou-b        même famille « genou » que le fémur : ils se superposent
pied                    une pastille seule — un point, pas un axe
```

Les deux pastilles `genou-…` du tibia doivent être **au même endroit sur le tibia** que celles du fémur le sont sur le fémur : c'est le point de contact, et c'est lui qu'on superpose.

Le fémur n'offre qu'**une** articulation de la famille `genou` : le tibia hérite donc du cap du fémur et le prolonge, au lieu de s'écarter comme les pattes le font autour du corps.

### 5. Regarder

```bash
npm run montre araignee
```

Cochez **axes dessinés**, **repère X Y Z** et **monté sur ses articulations**. Vous devez voir un corps, quatre fémurs, quatre tibias. Les cases **×4** apparaissent en face du fémur et du tibia : décochez-en une pour ne garder qu'une patte et voir le corps.

Puis retouchez dans Inkscape, cliquez **↻ recharger**, regardez. L'angle et les cases sont conservés.

### Ça ne donne pas ça — pourquoi

| Ce que vous voyez | La cause, presque toujours |
| --- | --- |
| **Une seule patte**, au milieu du corps | quatre hanches sous le **même préfixe** (`hanche-ag`, `hanche-ad`… seules). Il en faut quatre distincts, donc des noms à trois segments |
| **Deux pattes**, et deux longs traits rouges qui traversent le corps | `hanche-g-…` et `hanche-d-…` : deux axes, pas quatre. Renommez en `hanche-ag`, `hanche-ad`, `hanche-rg`, `hanche-rd` |
| **Le tibia reste tout seul** | le fémur n'a pas de pastille `genou-…`. Le genou se dessine **sur les deux** pièces |
| **Rien ne monte**, le visualiseur le dit en jaune | aucune famille partagée : les deux dessins n'emploient pas le même premier mot (`hanche` d'un côté, `epaule` de l'autre) |
| **La patte part à l'envers**, ou de travers | l'axe de hanche n'est pas là où vous croyez : cochez **axes dessinés**, le trait rouge tireté montre la droite réelle |
| **Une pièce est au centre du corps**, à 3 mm d'épaisseur | son étiquette est illisible — virgule décimale, presque toujours. Relisez la sortie de la commande, elle le dit |
| **Une pastille n'apparaît pas** | elle n'a pas de nom : son id Inkscape est encore `circle97`. La lecture le signale |

---

## Aide-mémoire

**Profils** (une pièce) :

- Un profil = **un contour fermé** + ses trous, dans un groupe `<nom>-profil`.
- Plaque = vue de **dessus**, haut du dessin = avant. Pièce = vue de **côté**, gauche → droite = première → seconde articulation.
- Les **proportions** comptent, pas les cotes : tout est remis à l'échelle.
- Un trou doit être **entièrement contenu** dans la pièce, sinon il est ignoré (avec un avertissement).
- Le contour ne doit **jamais se croiser** : c'est le seul tracé que le moteur ne sait pas mettre en volume.
- Une **pastille rouge nommée** est rangée avec la pièce : c'est une articulation, et elle suit la pièce à l'échelle.
- `profils.mts` est **généré** : on le relit, on ne l'édite pas.
- Extraire un profil ne perd pas les autres.
- Regardez le mode `:plat` **avant** de suspecter le moteur.

**Assemblages** (plusieurs pièces) :

- Une pièce = un groupe `<assemblage>-<pièce>` + **une étiquette de pose** en clair.
- Tout est en **millimètres**, et les cotes sont conservées : c'est un plan de découpe, pas une proportion.
- L'étiquette commence **toujours** par le plan : `dessus`, `flanc` ou `face`.
- `pos` est le **centre** de la pièce, pas son coin.
- `miroir` pose la pièce **deux fois** : un dessin de flanc donne les deux flancs.
- Le séparateur décimal est le **point** : `pos=24.501,-38.083,0 ep=21.5`. Une virgule rend l'étiquette illisible et la pièce retombe au centre — la lecture le dit.
- Une **pastille rouge nommée** devient un axe — c'est le dessin qui dit où est la hanche. Nommez-la par son **id Inkscape** ; le texte au-dessus fonctionne encore.
- Un nom de pastille se lit **`famille-articulation-bout`** : le **premier** segment est la famille (ce à quoi ça s'emboîte), tout sauf le **dernier** est le préfixe (quelle articulation), le dernier distingue les deux bouts.
- **Deux pastilles de même préfixe** (`hanche-ag-h`, `hanche-ag-b`) font un **axe de rotation**. Deux articulations distinctes = deux préfixes distincts.
- **Quatre hanches = quatre préfixes = huit pastilles.** `hanche-ag`, `hanche-ad`, `hanche-rg`, `hanche-rd` **seules** ne font qu'une articulation, au centre du corps.
- **Même famille = les dessins s'emboîtent**, articulations superposées : celui qui offre le plus d'articulations porte l'autre, et il naît un exemplaire par articulation (quatre hanches → quatre pattes).
- Le fémur porte **deux** familles : `hanche-…` pour s'accrocher au corps, `genou-…` pour porter le tibia.
- La **couleur de la pièce est celle du dessin**, transparence comprise ; `mat=` n'est que le repli d'une pièce non peinte.
- `npm run montre <préfixe>` relit, range et ouvre **tout ce qui commence par là**, à la même échelle : c'est la boucle de travail. On retouche dans Inkscape, on clique **↻ recharger**.
- Le curseur **éclaté** est le seul moyen de voir ce qu'il y a entre deux flancs.
- `assemblages.mts` est **généré**, et il est sa propre archive.
