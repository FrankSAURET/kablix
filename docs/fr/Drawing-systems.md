# Dessiner les systèmes en volume (araignée, pattes, plaques)

Le robot araignée et sa patte ne sont pas des SVG posés à l'écran : ce sont des **volumes calculés à chaque image** par le moteur isométrique [`iso3d.mts`](../../src/webview/composants/iso3d.mts). C'est ce qui permet à une patte de se lever pour de bon — un dessin plat, lui, donnait la même image qu'on tourne la coxa ou qu'on plie la patella.

Ce guide décrit : **vous dessinez le contour d'une pièce, le moteur le met en volume**. Le dessin reste de votre main, la cinématique, l'ombrage et le tri en profondeur restent au moteur.

Il y a **deux façons** de dessiner, et le guide les traite dans l'ordre :

| | Ce que vous dessinez | Ce que ça donne | Pour |
| --- | --- | --- | --- |
| **Profil** | **une** pièce à plat, à l'échelle libre | la pièce, mise aux cotes par le composant | une silhouette : le châssis du robot, un os de patte, une carte |
| **Assemblage** | **plusieurs** pièces à plat, **en millimètres**, chacune avec sa pose | le montage complet, cotes conservées | un corps en sandwich : deux flancs de 3 mm, les servos entre eux |

La différence tient en une phrase : dans un profil, seules les **proportions** comptent ; dans un assemblage, **les cotes sont l'information même** — entre deux flancs, 3 mm d'épaisseur et 25 mm d'entrefer ne se recalculent pas, ils se mesurent.

Ce guide s'adresse à qui travaille sur **le dépôt**. Pour un composant plat classique (une diode, un capteur), la chaîne est différente et décrite dans [Créer un composant Kablix](Creating-components.md).

Pressé ? Sautez à [dessin d'origine, ce que ça donne](#dessin-dorigine-ce-que-ca-donne) : trois images valent la page. Vous venez pour le corps en sandwich ? C'est [Assembler plusieurs pièces](#assembler-plusieurs-pieces). Vous butez sur une patte qui ne se monte pas comme vous vouliez ? C'est [Dessiner une patte, de la coxa au pied](#dessiner-une-patte-de-la-coxa-au-pied), et son tableau des symptômes.

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
- **Les pastilles rouges ne font pas partie du contour** — mais une pastille **nommée** est rangée avec la pièce : c'est une articulation (`coxa`, `patella`), elle porte un **axe** (une droite, pas un point), et son **premier mot** dit à quoi elle s'emboîte. Voir [Les axes](#les-axes) : la convention est celle des assemblages, à l'identique — un profil est lu comme une pièce à plat, ses axes sont donc verticaux. Une pastille anonyme et les textes restent de simples repères de planche, ignorés.

> Le piège classique est le **contour qui recule**. Sur le châssis d'exemple, l'encoche avant a d'abord été tracée plus large que les épaules qui l'encadrent : le tracé repartait en arrière et se repliait sur lui-même. Les bords d'une encoche se posent **sur** le cercle du corps, jamais au-delà.

Les noms que le code cherche déjà — les dessiner suffit, il n'y a rien à brancher :

| Nom du groupe | Pièce | Mise en scène | Repli sans dessin |
| --- | --- | --- | --- |
| `araignee-chassis` | plaque du robot araignée | plaque | octogone à 8 pans |
| `araignee-picow` | carte Pico W posée sur le dos du robot | plaque | pavé 46 × 18 |
| `araignee-pca9685` | carte 16 servos, sur la plaque | plaque | pavé 40 × 24 |
| `araignee-batterie` | pack d'accus, sur la plaque | plaque | pavé 34 × 18 |
| `patte-femur` | os coxa → patella | pièce | pavé |
| `patte-tibia` | os patella → pied | pièce | pavé |

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

Pour une plaque ([`araignee-element.mts`](../../src/webview/composants/araignee-element.mts)), le contour est en plus ramené au diamètre attendu et tourné du lacet de présentation, **pour que le dessin décide de la silhouette et non des cotes** : coxas, pattes, cartes et bornier restent là où le reste du composant les attend.

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

Un profil ne dit qu'une chose : une silhouette. Il ne sait pas dire **où** est la pièce par rapport à une autre, et c'est exactement ce qu'il faut pour un **corps en sandwich** : deux flancs de PMMA de 3 mm, les servos de coxa serrés entre eux, une entretoise à l'avant. Sur la planche à plat, rien de tout cela ne se voit — et une image fixe ne dit pas si les servos passent.

Un **assemblage** répond à ça. C'est un jeu de pièces plates, **en millimètres**, chacune portant sa **pose** écrite en clair dans le dessin. Le dessin reste ce qu'il doit rester : un **plan de découpe laser**, avec les pièces posées côte à côte sur la planche. Ce n'est pas leur place sur la planche qui compte, c'est leur étiquette.

### Le dessin

Dans `Composants3D.svg` (ou une planche à part, voir `--source=`) :

- **Une pièce = un groupe dont l'`id` commence par le nom de l'assemblage**, suivi du nom de la pièce : `araignee-corps-flanc`, `araignee-corps-servo`. Le suffixe `-profil` reste toléré (`araignee-corps-flanc-profil`) ; le nom retenu est ce qui suit le nom de l'assemblage.
- **La planche doit être en millimètres.** `Composants3D.svg` l'est déjà (`width="…mm"` et un `viewBox` du même nombre : 1 unité = 1 mm). Une planche en pixels CSS est convertie, mais vous ne saurez plus ce que vous cotez.
- **Un texte dans le groupe donne la pose** : `flanc pos=28,0,0 ep=12 mat=servo miroir=x`. C'est un simple `<text>`, posé où vous voulez dans le groupe — sous la pièce se lit bien.
- **Le contour, les trous et les courbes** suivent exactement les règles d'un profil (contour fermé, trous contenus dedans, pas de tracé qui se croise).
- **Une pastille rouge nommée = une articulation.** Son **id Inkscape** la nomme, à défaut le texte **au-dessus** d'elle, et son centre devient un **axe** 3D de l'assemblage — une droite dirigée comme l'épaisseur de sa pièce, centrée sur son zéro. Son **premier mot** est la famille : c'est lui qui dit à quel autre dessin elle s'emboîte ([détail](#les-axes)).

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

**Une pièce est posée par son CENTRE** (le milieu de sa boîte englobante) : `pos` est donc le centre de la pièce, pas son coin. C'est ce qui rend le miroir immédiat — un flanc à `pos=-9,0,0` avec `miroir=x` donne les deux flancs, **centres écartés de 18 mm**.

Deux pièges dans cette seule ligne, et ce sont les deux qui coûtent une découpe :

- **`miroir` se met sur la NORMALE du plan**, pas sur un axe au hasard : `flanc` a son épaisseur sur **x**, `dessus` sur **z**, `face` sur **y** (le tableau des trois plans, plus haut). Un `flanc` avec `miroir=y` ne sépare pas les deux flancs — il en pose un devant et un derrière, dans le même plan.
- **18 mm, c'est de CENTRE à CENTRE**, l'épaisseur non comprise. Deux flancs de 3 mm à `pos=±9` laissent **15 mm** entre eux et **21 mm** d'encombrement. Ce qu'il faut coter, c'est l'entrefer voulu : pour 18 mm de passage entre deux flancs de 3 mm, `pos=-10.5,0,0` — soit `(entrefer + ep) / 2`.

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

### Une image plaquée sur la pièce

Une couleur suffit pour du PMMA, pas pour une carte électronique : un Pico ou un PCA9685 ne se reconnaît qu'à sa sérigraphie. **Posez la photo sur le contour, dans le groupe de la pièce** — elle sera plaquée dessus en volume, à sa place et à sa taille.

```svg
<g id="corps-demo-entretoise-profil">
  <path class="piece" d="M 135,75 H 175 V 100 H 135 Z" />
  <image x="140" y="79" width="30" height="18" opacity="0.85" href="pico.webp" />
  <text x="155" y="107">face pos=0,-36,0 ep=3</text>
</g>
```

Ce qu'il faut savoir, et rien de plus :

- **Là où vous la posez sur la planche, là elle sera sur la pièce** : mêmes millimètres, même repère que le contour. Une photo qui déborde du contour est **découpée au contour** — sur une plaque échancrée, elle s'arrête au bord de la plaque. Une photo plus petite reste plus petite : elle se pose, elle ne remplit pas.
- **La transparence est celle du dessin** (`opacity` de l'image, ou du calque qui la porte), donc réglable au curseur dans Inkscape : à 100 % la photo cache la matière, à 40 % on voit la plaque au travers.
- **Elle se plaque sur le côté que l'on VOIT.** Pas sur un côté choisi d'avance : les deux flancs de la pièce sont projetés et c'est le plus proche de l'œil qui la prend. Un demi-tour de présentation la fait changer de côté toute seule.
- **Tournez-la, elle suit** : Inkscape écrit une matrice, l'image la garde. Une carte posée de travers reste de travers en volume.
- **Une seule image par pièce** : c'est un habillage, pas un collage. La deuxième est ignorée.
- **Formats acceptés : `.webp`, `.png`, `.jpg`.** Une image liée est retrouvée **à côté de la planche** et **embarquée** dans le module rangé — la webview ne va jamais lire un fichier sur le disque. Préférez donc le WebP : un JPEG de 4 Mo sur une plaque de 30 mm ne se verra pas mieux, mais il pèsera 4 Mo dans l'extension. Lien introuvable ou format non géré : l'image est ignorée, avec un message à l'extraction.

L'entretoise de [`corps-demo.svg`](../exemples/corps-demo.svg) en porte une — c'est la petite carte verte qu'on voit sur son flanc dans les images plus bas.

### Les axes

Une **pastille rouge** dans le groupe d'une pièce marque une articulation : un axe de coxa, une patella, un pivot. Ses coordonnées sont calculées **dans le repère de l'assemblage**, pose comprise.

#### Une pastille porte une DROITE, pas un point

C'est ce que le plan de découpe dit sans le dire, et c'est ce qui emboîte les pièces les unes dans les autres :

> **Une pièce en miroir est posée deux fois, et entre ses deux exemplaires passe un axe de rotation, dirigé comme la flèche `ép` — le sens de son épaisseur.** La pastille dit *où* cette droite passe ; le **plan de la pièce** dit *dans quel sens*.

| La pièce est un… | Son épaisseur part | L'axe de ses pastilles est | Ce que ça fait |
| --- | --- | --- | --- |
| `dessus` | verticalement | **vertical — Z** | une coxa : la patte balaye à droite et à gauche |
| `flanc` | en travers du robot | **en travers — X** | une patella : la patte plie de haut en bas |
| `face` | d'avant en arrière | **d'avant en arrière — Y** | une charnière de capot |

Les deux plaques de support du corps (`dessus pos=0,0,-13.75 ep=3 miroir=z`) sont posées à ∓13,75 mm : le servo de coxa tient entre elles, et son axe est la verticale qui passe **au milieu**. C'est ce milieu — le **zéro de l'axe** — qui est rangé, jamais la pastille telle qu'elle est dessinée sur l'une des deux plaques. Une pièce sans miroir suit la même règle : son axe est rangé au zéro de l'assemblage.

Vous n'avez donc **rien à faire de plus** : dessinez la pastille sur la pièce, le sens et le milieu se déduisent du plan et du miroir. La lecture l'annonce famille par famille, et c'est la ligne à relire quand un montage part de travers :

```text
    famille « coxa » : 4 pastille(s), axe Z — coxa-gh, coxa-dh, coxa-gb, coxa-db
```

Dans le visualiseur, la case **axes dessinés** trace la droite en entier, en pointillé rouge, en plus du point et de son nom.

Deux façons de la nommer, dans cet ordre :

1. son **ID Inkscape** — sélectionnez le rond, `Objet → Propriétés de l'objet`, écrivez `coxa-gh` ;
2. à défaut, le **texte libre le plus proche**, celui du dessus étant préféré — exactement comme le nom d'une broche sur la planche des composants.

L'ID passe devant parce qu'il **colle au rond** : il survit à un déplacement, à un texte ajouté à côté, et il n'encombre pas la planche de quatre étiquettes quand la pièce porte quatre pastilles. Si le rond est **groupé** (Inkscape groupe dès qu'on déplace un repère), le nom du **groupe** fait aussi bien l'affaire : la lecture remonte au premier parent nommé à la main. Un id qu'Inkscape a fabriqué tout seul (`circle91`, `path102`, `g1-1`) ne nomme rien : la pastille est alors **ignorée**, avec un avertissement à la lecture.

C'est le point important du protocole : **c'est le dessin qui dit où est la coxa**, plus une constante du code. Déplacez le trou dans Inkscape, l'axe suit.

#### Une pastille = une articulation, son premier mot dit à quoi elle s'emboîte

Tout tient dans une seule phrase, et le reste de cette section n'en est que le détail :

> **Une pastille rouge est une articulation à elle seule.** Son **premier mot** est la **famille** — il dit *à quoi ça s'emboîte* ; ce qui suit ne sert qu'à donner des **ids distincts** à deux pastilles voisines, comme Inkscape l'exige.

| Nom de la pastille | Famille = ce à quoi ça s'emboîte | Ce que fait le reste du nom |
| --- | --- | --- |
| `coxa-gh` | `coxa` | distingue les quatre coxas du corps |
| `coxa-db` | `coxa` | idem |
| `coxa` | `coxa` | seule de sa famille : rien à distinguer |
| `patella-f` | `patella` | la patella **côté fémur** |
| `patella-t` | `patella` | le même point, **côté tibia** |
| `pied` | `pied` | un simple repère, sans vis-à-vis |

Il n'y a rien à regrouper, rien à apparier : **autant de pastilles, autant d'articulations**.

#### Quatre pastilles « coxa… » = quatre pattes

C'est de là que sort le nombre d'exemplaires, et cela ne se voit pas sur l'image :

```text
corps :  coxa-gh ─┐
         coxa-dh  ├─ QUATRE pastilles de la famille « coxa »
         coxa-gb  │
         coxa-db ─┘

fémur :  coxa     ─── UNE pastille de la même famille
                        → le fémur est dupliqué QUATRE fois
```

Le fémur porte à son autre bout un `patella-f` ; le tibia porte un `patella-t`. **Même premier mot, donc même axe de contact** — le `-f` et le `-t` ne sont là que parce qu'Inkscape refuse deux ids identiques. Quatre fémurs offrent donc quatre patellas, et il naît **quatre tibias**.

> Une seule patte au milieu du corps ? Les quatre coxas ont été dessinées avec le **même nom** (une seule pastille lue), ou trois d'entre elles n'ont pas de nom du tout — la lecture liste les familles et leurs pastilles, c'est là qu'on le voit.

#### Une famille partagée = deux dessins qui s'emboîtent

Les articulations ne servent pas qu'à faire tourner : **c'est par elles que les dessins se montent les uns sur les autres**, sans que vous ayez une seule cote à reporter.

La règle est courte :

1. Deux ensembles dont une pastille porte le **même premier mot** s'emboîtent : le corps a des `coxa…`, le fémur aussi → le fémur se pose sur le corps. À nom égal, la famille dont les **deux axes pointent dans le même sens** passe devant : une coxa verticale cherche une coxa verticale.
2. **Celui qui offre le plus d'articulations porte l'autre.** Le corps en a quatre, le fémur deux : c'est le corps qui porte, et il naît **quatre fémurs**.
3. **Les deux axes sont superposés — même droite — et centrés sur leur zéro**, celui de chacun des deux dessins. Le fémur ne vient donc pas se coller contre un flanc : il se **centre entre les deux**, parce que son propre zéro est le milieu de ses deux côtés. La position ne se calcule pas, elle se lit dans le dessin.
4. Quand la famille compte **plusieurs** pastilles chez le parent (les quatre coxas), chaque exemplaire est **tourné vers la sienne** : les pattes s'écartent d'elles-mêmes. Quand elle n'en compte qu'**une** (la patella du fémur), l'enfant garde le cap de son parent : le tibia prolonge le fémur.

Une chaîne complète tient donc en trois dessins et six noms :

```text
araignee-corps          coxa-gh  coxa-dh  coxa-gb  coxa-db
araignee-patte-femur    coxa          ← s'emboîte sur le corps (famille « coxa »)
                        patella-f         ← offre une patella
araignee-patte-tibia    patella-t         ← s'emboîte sur le fémur (famille « patella »)
```

Résultat à l'écran : **un corps, quatre fémurs, quatre tibias**, chacun à sa place, sans une ligne de code. C'est ce que fait `npm run montre araignee`.

Un ensemble qui ne partage aucune famille reste **à sa propre origine** : il n'est pas deviné, il est simplement posé. Et si aucun ensemble n'en partage avec un autre, le visualiseur le dit et retombe sur l'affichage côte à côte.

#### Un profil aussi

Une pièce dessinée seule (un profil) suit la **même convention** : ses pastilles nommées sont rangées avec son contour, dans le même repère centré. Quand le composant la pose entre deux articulations, `profileAxes` les emporte avec elle — à l'échelle, à sa place. Une patella dessiné sur le fémur reste la patella du fémur, qu'on allonge la patte ou non.

### Le regarder tourner

```bash
npm run montre araignee            # TOUT ce qui commence par « araignee »
npm run montre araignee-corps      # un seul assemblage
```

L'argument est un **préfixe**, pas un nom exact : l'outil ramasse dans la planche **tous les assemblages et tous les profils** qui commencent par là, et les montre **ensemble, à la même échelle**. La planche n'est lue qu'**une fois** pour tout le préfixe (la lecture passe par Chrome : c'est le temps d'attente, autant ne le payer qu'une fois).

**Demander le préfixe global, c'est demander le robot entier.** `npm run montre araignee` ne pose pas trois dessins côte à côte : il les **monte**, chacun sur les articulations du précédent, axes superposés — un corps, quatre fémurs, quatre tibias. Trois dessins sur la planche, un robot à l'écran. C'est la case **monté sur ses articulations**, cochée par défaut ; décochez-la pour retrouver les dessins séparés.

Un profil, dessiné seul et sans cotes, est traité comme un assemblage d'une pièce : sa grille de 10 px devient des millimètres et il se pose à plat, 3 mm d'épaisseur, à côté des vrais assemblages.

Ce qui est lu est aussi **rangé** : `assemblages.mts` et `profils.mts` sont réécrits, exactement comme le feraient `npm run assemblage` et `npm run profils`.

| Dans la fenêtre | Ce que ça sert |
| --- | --- |
| Bouton **↻ recharger** | relire `Composants3D.svg` **sans quitter la fenêtre** : on retouche dans Inkscape, on clique, on regarde. L'angle, le zoom et les cases cochées sont conservés |
| **Glisser dans la vue** (ou le curseur *lacet*) | tourner autour : l'angle où ça coince n'est jamais celui de la première image |
| Curseur **éclaté** | écarter les pièces le long de leur épaisseur — le seul moyen de voir ce qu'il y a entre deux flancs serrés à 3 mm |
| Curseur **zoom** | regarder un détail de près |
| Case de titre **d'un ensemble** | masquer tout un assemblage — regarder le fémur seul sans relancer la commande |
| Case **×4** à droite du titre | l'ensemble a reçu quatre exemplaires (quatre coxas, quatre pattes). Décochez-la pour n'en garder qu'**un** : quatre pattes cachent le corps qu'on voulait voir. Ce qu'elle porte suit — un seul fémur ne tient qu'un tibia |
| Cases **pièces** | cacher un flanc pour voir dedans |
| Case **axes dessinés** | montrer les articulations nommées à leur place en 3D : le point, son nom, et la **droite de l'axe en pointillé rouge**. C'est la vérification qu'elles sont bien où vous croyez — et qu'elles pointent dans le bon sens |
| Case **repère X Y Z** | le repère du monde dans un coin, tourné avec la scène : il dit à tout moment où est l'avant |
| Case **monté sur ses articulations** | **le robot assemblé** : chaque ensemble posé sur les articulations du précédent, axes superposés et zéros confondus, un exemplaire par articulation. Décochée, on retombe sur les dessins séparés |
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
    famille « coxa » : 2 pastille(s), axe Z — coxa-g, coxa-d
  → corps-demo : 3 pièce(s), 2 axe(s), 100×80×31 mm
```

La ligne `famille « coxa »` est celle qu'il faut lire : **deux pastilles, donc deux coxas**, et deux pattes à venir. C'est le nombre de pattes, visible avant même d'ouvrir la fenêtre — un corps d'araignée doit y afficher `4 pastille(s)`. `axe Z` dit dans quel sens tournera l'articulation ; une famille dont les pastilles sont réparties sur des plans différents affiche `axe X/Z` et un avertissement — c'est qu'elle a été dessinée sur la mauvaise pièce. Une pastille anonyme se signale à cette ligne-là (`! …-supports : pastille sans nom (id « circle91 »), ignorée`) : c'est le moment de lui donner un id dans Inkscape.

La couleur affichée est celle qui a été **lue sur le dessin** (`#rrggbbaa`, transparence comprise) — `8c` en fin de ligne, c'est le PMMA à 55 %. Une pièce non peinte affiche à la place le mot de son `mat=`.

`src/webview/composants/assemblages.mts` est **généré**, et il est **sa propre archive** : l'outil le relit avant de le réécrire, extraire un assemblage ne fait pas disparaître les autres. Comme `profils.mts`, il se lit dans un `git diff` mais ne se modifie pas à la main.

Le banc `verify:assemblage` est du calcul pur, comme celui des profils. Il éprouve la **lecture de l'étiquette** (une position négative doit rester entière — `pos=0,-9,0` a déjà été lu comme trois mots), les **plans** (une plaque de 100 mm posée à plat encombre 100 × 80 × 3, jamais 103 × 83 × 35), le **miroir**, l'**éclaté** (chaque pièce s'écarte du côté où elle est déjà, une pièce centrale ne bouge pas), puis **chaque assemblage rangé** : plan et matière connus, contour centré, cotes conformes, encombrement conforme au calcul, axes dans la boîte. Il éprouve aussi les **couleurs lues sur le dessin** — la teinte du dessin passe devant `mat=`, la transparence traverse l'éclairage sans s'y perdre, et une face translucide sort sans liseré — et les **articulations** : chaque pastille en est une, son premier mot fait sa famille, aucune pastille rangée ne porte un numéro de duplication Inkscape, et les pastilles d'un profil suivent la pièce quand on l'allonge.

Il éprouve à part la règle de l'**axe** : une pastille porte une droite dirigée par la normale de sa pièce (`dessus`→Z, `flanc`→X, `face`→Y), rangée à son **zéro** — au milieu des deux exemplaires d'une pièce en miroir — et chaque assemblage rangé est repassé sur ce point.

Il éprouve enfin le **montage**, sur un robot d'essai puis **sur l'araignée réellement dessinée** — un corps à quatre coxas, un fémur, un tibia : c'est le corps qui porte (il offre le plus d'articulations), il naît quatre fémurs et quatre tibias, chacun sur une coxa différente, axes **superposés au millimètre, zéros confondus**, chaque exemplaire accroché par un axe de **même direction** que celui qui le porte, les quatre pattes tournées vers quatre caps distincts, le tibia gardant le cap de son fémur. Un ensemble qui ne partage aucune famille reste à sa place, et deux dessins sans rien en commun ne montent rien du tout plutôt que d'inventer.

---

## Dessiner une patte, de la coxa au pied

Le cas complet, celui qui met tout ce qui précède bout à bout : un corps, un fémur, un tibia, et **quatre pattes** à l'arrivée. Trois dessins seulement — les quatre exemplaires ne se dessinent pas, ils naissent des quatre coxas.

### 1. Trois groupes, trois assemblages

```text
araignee-corps-…          le corps : plaques, cartes, batterie
araignee-patte-femur-…    l'os coxa → patella, et le servo de patella qu'il porte
araignee-patte-tibia-…    l'os patella → pied
```

Chacun se dessine **où vous voulez sur la planche**, côte à côte comme un plan de découpe. Ce n'est pas leur place sur la planche qui compte : c'est leur étiquette de pose, et leurs pastilles.

### 2. Le corps : quatre pastilles, quatre coxas

Une coxa tourne autour d'une **verticale** : elle se dessine donc sur une pièce **`dessus`**, dont l'épaisseur part vers le haut ([pourquoi](#une-pastille-porte-une-droite-pas-un-point)). Sur les supports qui tiennent réellement les servos de coxa — deux plaques à plat en miroir, le servo serré entre elles —, **une** pastille rouge par coxa :

```text
coxa-gh        gauche avant
coxa-dh        droite avant
coxa-gb        gauche arrière
coxa-db        droite arrière
```

Les quatre commencent par `coxa` : c'est ce mot, et lui seul, qui fait venir le fémur. Ce qui suit ne sert qu'à leur donner **quatre ids distincts** — Inkscape refuse deux fois le même. **Posez chaque pastille où l'axe du servo passe vraiment** : c'est là que la patte tournera. La plaque est en `miroir=z` ? Dessinez la pastille **une seule fois**, sur le dessin : l'axe se place tout seul au milieu des deux plaques.

La lecture doit annoncer `famille « coxa » : 4 pastille(s), axe Z`. Si elle annonce `axe X`, les pastilles ont été dessinées sur un flanc : la coxa plierait de haut en bas au lieu de balayer.

Nommez-les par leur **id Inkscape** (`Objet → Propriétés de l'objet`) : quatre textes sur la planche encombreraient le dessin.

### 3. Le fémur : deux articulations, pas une

C'est ici que ça coince le plus souvent. Le fémur porte **deux** articulations, et il lui faut les deux :

| Pastille | À quoi elle sert |
| --- | --- |
| `coxa` | **là où le fémur s'accroche au corps.** Famille `coxa` : c'est le mot que le corps emploie aussi, et c'est tout ce qu'il faut pour qu'ils s'emboîtent. À dessiner sur une pièce à plat, comme celle du corps : les deux axes doivent être **verticaux** tous les deux |
| `patella-f` | **l'axe que le fémur offre au tibia.** Famille `patella`. Sur un `flanc`, donc **en travers (X)** : le tibia plie de haut en bas |

Un fémur qui n'a que sa coxa se pose bien sur le corps — mais le tibia n'a plus rien à quoi s'accrocher, et il reste tout seul dans son coin. **La patella se dessine sur le fémur**, pas seulement sur le tibia.

Le fémur est un `flanc` : dessiné de côté, il se relève **tel qu'il est tracé**. Ce que vous dessinez en haut sera en haut du robot. Si la patte part à l'envers, c'est le dessin qui est retourné, pas le moteur — cochez **repère X Y Z** et regardez où pointe le Z.

### 4. Le tibia : la patella

```text
patella-t         même premier mot que le « patella-f » du fémur : les deux axes se superposent
```

La pastille `patella-t` doit être **au même endroit sur le tibia** que `patella-f` l'est sur le fémur : c'est l'axe de contact, et c'est lui qu'on superpose. Dessinez-la sur un `flanc` comme le fémur — deux axes qui ne pointent pas dans le même sens ne s'emboîtent pas. Le `-f` et le `-t` ne veulent rien dire de plus que « côté fémur » et « côté tibia » — il faut bien deux ids différents.

Le fémur n'offre qu'**une** pastille de la famille `patella` : le tibia hérite donc du cap du fémur et le prolonge, au lieu de s'écarter comme les pattes le font autour du corps.

### 5. Regarder

```bash
npm run montre araignee
```

Cochez **axes dessinés**, **repère X Y Z** et **monté sur ses articulations**. Vous devez voir un corps, quatre fémurs, quatre tibias. Les cases **×4** apparaissent en face du fémur et du tibia : décochez-en une pour ne garder qu'une patte et voir le corps.

Puis retouchez dans Inkscape, cliquez **↻ recharger**, regardez. L'angle et les cases sont conservés.

### Ça ne donne pas ça — pourquoi

| Ce que vous voyez | La cause, presque toujours |
| --- | --- |
| **Une seule patte**, au milieu du corps | le corps n'a qu'**une** pastille `coxa…`. Il en faut quatre — une par coxa, à leur vraie place |
| **Deux pattes** au lieu de quatre | deux pastilles `coxa…` seulement. Le nombre de pattes est le nombre de pastilles de la famille, rien d'autre |
| **Cinq pattes**, dont une en trop au même endroit | une pastille dupliquée dans Inkscape : elle s'appelle `coxa-gh-3`. Renommez-la, ou effacez-la si c'est un doublon (la lecture le signale) |
| **Le tibia reste tout seul** | le fémur n'a pas de pastille `patella…`. La patella se dessine **sur les deux** pièces |
| **Rien ne monte**, le visualiseur le dit en jaune | aucune famille partagée : les deux dessins n'emploient pas le même premier mot (`coxa` d'un côté, `epaule` de l'autre) |
| **La patte part à l'envers**, ou de travers | la coxa n'est pas là où vous croyez : cochez **axes dessinés**, le nom s'affiche à la place réelle de la pastille |
| **La patte pivote dans le mauvais sens** (elle plie au lieu de balayer) | l'axe est dirigé par le **plan de la pièce** : une coxa verticale se dessine sur un `dessus`, une patella en travers sur un `flanc`. Cochez **axes dessinés** : le pointillé rouge montre la droite |
| **La patte est collée contre une plaque** au lieu d'être centrée entre les deux | la pastille a été dessinée deux fois à la main, une par plaque, au lieu d'une fois sur une pièce en `miroir`. Le zéro de l'axe est alors faux, et deux articulations naissent au lieu d'une |
| **Deux dessins ne s'emboîtent pas**, même famille pourtant | leurs axes ne pointent pas dans le même sens : la lecture affiche `axe X/Z` et un avertissement. L'un des deux est dessiné sur la mauvaise pièce |
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
- Une **pastille rouge nommée** est rangée avec la pièce : c'est une articulation — un **axe**, vertical pour un profil — et elle suit la pièce à l'échelle.
- `profils.mts` est **généré** : on le relit, on ne l'édite pas.
- Extraire un profil ne perd pas les autres.
- Regardez le mode `:plat` **avant** de suspecter le moteur.

**Assemblages** (plusieurs pièces) :

- Une pièce = un groupe `<assemblage>-<pièce>` + **une étiquette de pose** en clair.
- Tout est en **millimètres**, et les cotes sont conservées : c'est un plan de découpe, pas une proportion.
- L'étiquette commence **toujours** par le plan : `dessus`, `flanc` ou `face`.
- `pos` est le **centre** de la pièce, pas son coin.
- `miroir` pose la pièce **deux fois** : un dessin de flanc donne les deux flancs. Il se met sur la **normale du plan** (`flanc`→`x`, `dessus`→`z`, `face`→`y`), et l'écart obtenu est de **centre à centre** : `pos=(entrefer + ep) / 2`.
- Le séparateur décimal est le **point** : `pos=24.501,-38.083,0 ep=21.5`. Une virgule rend l'étiquette illisible et la pièce retombe au centre — la lecture le dit.
- Une **pastille rouge nommée = une articulation** — c'est le dessin qui dit où est la coxa. Nommez-la par son **id Inkscape** ; le texte au-dessus fonctionne encore.
- Le **premier mot** du nom est la **famille** : il dit à quoi ça s'emboîte. Ce qui suit ne sert qu'à donner des **ids distincts** (`coxa-gh`, `patella-f` / `patella-t`).
- **Une pastille = une articulation.** Quatre pastilles `coxa…` sur le corps = **quatre coxas**, donc quatre pattes. Deux pastilles ne se regroupent jamais.
- **Une pastille porte un AXE, pas un point** : une droite dirigée comme l'épaisseur de sa pièce — `dessus`→**Z** (coxa qui balaye), `flanc`→**X** (patella qui plie), `face`→**Y**. Une pièce en `miroir` la pose deux fois : l'axe passe **entre** les deux exemplaires.
- L'axe est rangé à son **zéro** : le milieu des deux exemplaires en miroir. Rien à calculer, rien à dessiner deux fois.
- **Même famille = les dessins s'emboîtent**, **axes superposés et zéros confondus** : celui qui en offre le plus porte l'autre, et il naît **un exemplaire par pastille** (quatre coxas → quatre fémurs → quatre patellas → quatre tibias). Deux axes de directions différentes ne s'emboîtent pas — la lecture affiche `axe X/Z` et prévient.
- Le fémur porte **deux** familles : `coxa` pour s'accrocher au corps, `patella-f` pour porter le tibia.
- Un nom qui finit par **`-3`, `-1`…** est presque toujours le suffixe qu'Inkscape colle à un copier-coller : la lecture le signale, renommez-le.
- La **couleur de la pièce est celle du dessin**, transparence comprise ; `mat=` n'est que le repli d'une pièce non peinte.
- Une **image posée sur le contour** (`.webp`, `.png`, `.jpg`) est plaquée sur la pièce, **du côté que l'on voit**, **découpée au contour** et avec **la transparence du dessin**. Une seule par pièce ; un fichier lié est embarqué à l'extraction.
- `npm run montre <préfixe>` relit, range et ouvre **tout ce qui commence par là**, à la même échelle : c'est la boucle de travail. On retouche dans Inkscape, on clique **↻ recharger**.
- Le curseur **éclaté** est le seul moyen de voir ce qu'il y a entre deux flancs.
- `assemblages.mts` est **généré**, et il est sa propre archive.
