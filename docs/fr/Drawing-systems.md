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

Pressé ? Sautez à [dessin d'origine, ce que ça donne](#dessin-dorigine-ce-que-ca-donne) : trois images valent la page. Vous venez pour le corps en sandwich ? C'est [Assembler plusieurs pièces](#assembler-plusieurs-pieces).

---

## Ce qu'il faut avoir

- Le dépôt cloné, `npm install` passé, Node 20+.
- **Inkscape** (ou tout éditeur SVG) pour dessiner dans `Composants.svg`.
- **Chrome / Chromium** installé : la lecture des contours passe par un navigateur sans interface. Aplatir à la main des courbes de Bézier et des arcs elliptiques en Node serait du code faux à écrire deux fois — `getPointAtLength` le fait juste, et gratuitement.

---

## La chaîne en un coup d'œil

**Un profil** — une pièce, à l'échelle libre :

| # | Étape | Commande / fichier |
| --- | --- | --- |
| 1 | Dessiner le contour de la pièce | `Composants.svg`, groupe `<nom>-profil` |
| 2 | Le lire | `npm run profil <nom>` → `src/webview/composants/profils.mts` |
| 3 | Le regarder | `node scripts/_capture-profil.mjs <nom>:plat` puis `<nom>:plaque` ou `<nom>:piece` |
| 4 | Le mettre en volume | rien à faire si le nom est déjà attendu (tableau plus bas), sinon l'élément |
| 5 | Contrôler | `npm run verify:profils` |

**Un assemblage** — plusieurs pièces, en millimètres :

| # | Étape | Commande / fichier |
| --- | --- | --- |
| 1 | Dessiner les pièces, chacune avec son **étiquette de pose** | `Composants.svg`, groupes `<assemblage>-<pièce>` |
| 2 | Le lire et **le regarder tourner** | `npm run montre <assemblage>` |
| 3 | Le ranger seul (sans ouvrir de fenêtre) | `npm run assemblage <assemblage>` → `src/webview/composants/assemblages.mts` |
| 4 | En tirer les images de la doc | `node scripts/_capture-profil.mjs <assemblage>:assemblage` et `:eclate` |
| 5 | Contrôler | `npm run verify:assemblage` |

L'étape 4 des profils est vide dans le cas courant : les composants **cherchent déjà** leurs profils par leur nom et retombent sur la forme codée en dur tant que le dessin n'existe pas. Dessiner `araignee-chassis` puis l'extraire suffit à changer la silhouette du robot, sans toucher une ligne de TypeScript.

Côté assemblage, `npm run montre` fait les étapes 1 à 3 d'un coup : il relit le dessin, le range, et ouvre la scène dans une fenêtre où vous la tournez. C'est **la** boucle de travail — on redessine dans Inkscape, on relance, on regarde.

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

C'est la seule chose qu'on ne peut pas deviner à votre place.

- **Plaque** : dessinée **vue de dessus**, le **haut du dessin est l'avant** du robot.
- **Pièce** : dessinée **vue de côté, couchée à l'horizontale**. Le **bord gauche** du dessin tombe sur la première articulation, le **bord droit** sur la seconde. Le haut du dessin reste en haut.

Deux conséquences qui évitent bien des surprises :

1. **Les cotes du dessin ne comptent pas, ses proportions si.** Une plaque est ramenée au diamètre du châssis ; une pièce est mise à l'échelle **en bloc** (longueur *et* hauteur par le même facteur) pour aller d'une articulation à l'autre. Le même fémur sert donc à la patte seule et aux pattes du robot, plus longues, sans s'y déformer. Dessinez à une taille confortable, pas à une taille « juste ».
2. **Le centrage est automatique**, sur le milieu de la boîte englobante. Inutile de caler votre dessin sur l'origine de la planche.

Les coordonnées rangées sont en **pixels de la grille 10 px** du canevas. Si votre planche Inkscape est en millimètres — c'est le cas de `Composants.svg` — la conversion est faite au passage.

---

## Dessiner le profil

Dans `Composants.svg`, la planche A3 où vivent tous les dessins d'origine :

- **Un profil = un groupe (ou un simple chemin) dont l'`id` est `<nom>-profil`.** Le nom sans suffixe est accepté en repli, mais le suffixe évite de confondre un profil avec le dessin plat d'un composant du même nom.
- **Un contour fermé pour la pièce.** Les contours **entièrement contenus** dedans sont ses **trous** (perçages, allègements). Un contour qui n'est ni la pièce ni contenu dedans est signalé et ignoré — deux pièces dans le même groupe, c'est un dessin à corriger, pas une devinette à trancher.
- **Le contour ne doit pas se croiser.** Une silhouette en 8, un bord replié sur lui-même : le découpage n'a alors pas de sens et `verify:profils` le refuse.
- **Les courbes sont admises** : Bézier, arcs, cercles, rectangles, polygones. Tout est aplati puis simplifié — un cercle échantillonné finit à une trentaine de points, pas deux cents.
- **Le sens de tracé est indifférent** (horaire ou trigonométrique) : il est normalisé à la lecture.
- **Pastilles rouges et textes sont ignorés** : ce sont les repères habituels de la planche, ils ne font pas partie de la pièce.

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
| `--source=chemin.svg` | Lit un autre fichier que `Composants.svg` (les exemples de ce guide viennent de `docs/exemples/`). |
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

Dans `Composants.svg` (ou une planche à part, voir `--source=`) :

- **Une pièce = un groupe dont l'`id` commence par le nom de l'assemblage**, suivi du nom de la pièce : `araignee-corps-flanc`, `araignee-corps-servo`. Le suffixe `-profil` reste toléré (`araignee-corps-flanc-profil`) ; le nom retenu est ce qui suit le nom de l'assemblage.
- **La planche doit être en millimètres.** `Composants.svg` l'est déjà (`width="…mm"` et un `viewBox` du même nombre : 1 unité = 1 mm). Une planche en pixels CSS est convertie, mais vous ne saurez plus ce que vous cotez.
- **Un texte dans le groupe donne la pose** : `flanc pos=28,0,0 ep=12 mat=servo miroir=x`. C'est un simple `<text>`, posé où vous voulez dans le groupe — sous la pièce se lit bien.
- **Le contour, les trous et les courbes** suivent exactement les règles d'un profil (contour fermé, trous contenus dedans, pas de tracé qui se croise).
- **Une pastille rouge nommée = un axe.** Comme pour les broches d'un composant : le texte **au-dessus** de la pastille la nomme, et son centre devient un point 3D de l'assemblage.

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
| `mat=pmma` | matière, c'est-à-dire la couleur | `pmma` |
| `miroir=x` | la pièce est posée **deux fois**, symétriquement | pas de miroir |

`miroir` seul (sans `=`) vaut `miroir=y`. Une valeur inconnue (`mat=titane`, `pos=3,4`) est ignorée et la valeur par défaut s'applique : la pièce apparaît alors visiblement fausse, plutôt que muette.

### Les trois plans

Le repère du monde est celui du moteur : **X à droite, Y vers l'arrière, Z vers le haut**. Le `y` d'un dessin SVG **descend** — c'est ce qui explique la colonne du milieu.

| Plan | Le dessin est vu | `x` du dessin | `y` du dessin | L'épaisseur part | Exemples |
| --- | --- | --- | --- | --- | --- |
| `dessus` | de dessus, **avant en haut** | vers la droite | vers l'**arrière** | verticalement | plaques, platines, ponts |
| `flanc` | de côté, **avant à gauche** | vers l'**arrière** | vers le **bas** | en travers du robot | les deux flancs, un servo couché |
| `face` | de face | vers la droite | vers le **bas** | d'avant en arrière | cloison, entretoise, capot avant |

**Une pièce est posée par son CENTRE** (le milieu de sa boîte englobante) : `pos` est donc le centre de la pièce, pas son coin. C'est ce qui rend le miroir immédiat — un flanc à `pos=0,-9,0` avec `miroir=y` donne les deux flancs, écartés de 18 mm.

### Les matières

Le mot dit la couleur, et rien d'autre : aucune simulation, aucune masse.

| `mat=` | Couleur | Pour |
| --- | --- | --- |
| `pmma` | bleu clair | le PMMA découpé au laser — c'est le défaut |
| `alu` | gris clair | équerres, entretoises métalliques |
| `servo` | noir | un servo, un moteur, un bloc plein |
| `carte` | vert | un circuit imprimé |
| `laiton` | doré | visserie, entretoises filetées |
| `pile` | gris ardoise | accus, pack de batteries |

### Les axes

Une **pastille rouge** dans le groupe d'une pièce marque un point remarquable : un axe de hanche, un genou, un pivot. Le texte le plus proche **au-dessus** d'elle la nomme (`hanche-g`), exactement comme le nom d'une broche sur la planche des composants. Ses coordonnées sont calculées **dans le repère de l'assemblage**, pose comprise.

C'est le point important du protocole : **c'est le dessin qui dit où est la hanche**, plus une constante du code. Déplacez le trou dans Inkscape, l'axe suit.

### Le regarder tourner

```bash
npm run montre araignee-corps
```

La commande relit le dessin, le range, et ouvre une fenêtre Chrome sur la scène — **le vrai moteur**, celui du composant, pas un aperçu approchant.

| Dans la fenêtre | Ce que ça sert |
| --- | --- |
| **Glisser dans la vue** (ou le curseur *lacet*) | tourner autour : l'angle où ça coince n'est jamais celui de la première image |
| Curseur **éclaté** | écarter les pièces le long de leur épaisseur — le seul moyen de voir ce qu'il y a entre deux flancs serrés à 3 mm |
| Curseur **zoom** | regarder un détail de près |
| Cases **pièces** | cacher un flanc pour voir dedans |
| Case **axes dessinés** | montrer les pastilles nommées, à leur place en 3D |

Le panneau affiche l'**encombrement en millimètres** (`100 × 80 × 31 mm`) : c'est la cote qu'on lit sur un plan de montage, et le premier signe qu'une pièce est posée de travers.

Deux options utiles : `--source=docs/exemples/corps-demo.svg` pour lire une autre planche, `--sans-lire` pour rouvrir sans relire le dessin (quand seul le moteur a changé).

### Dessin d'origine, ce que ça donne

L'exemple complet est dans [`docs/exemples/corps-demo.svg`](../exemples/corps-demo.svg) : un corps de robot en sandwich, **trois pièces dessinées** qui en font **cinq** une fois posées.

| Le dessin | Assemblé | Éclaté |
| --- | --- | --- |
| ![Le plan de découpe du corps de démonstration](../exemples/corps-demo.svg) | ![Le corps assemblé](../img/systemes/corps-demo.webp) | ![Le même corps, éclaté](../img/systemes/corps-demo-eclate.webp) |
| Trois groupes posés côte à côte, comme un plan de découpe : la plaque (`dessus pos=0,0,14 ep=3 miroir=z`), le servo (`flanc pos=28,0,0 ep=12 mat=servo miroir=x`), l'entretoise (`face pos=0,-36,0 ep=3`). | Les deux plaques à 14 mm de part et d'autre du plan médian : 25 mm d'air entre elles, juste ce qu'il faut pour un servo couché. Encombrement : 100 × 80 × 31 mm. | Chaque pièce écartée le long de son épaisseur. Les servos apparaissent : c'est cette vue qui répond à « est-ce que ça rentre ? ». |

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
  ✓ entretoise : 5 points, 40×25 mm, face ép.3 pmma
  ✓ plaque : 10 points, 100×80 mm, dessus ép.3 pmma miroir=z, 3 trou(s)
  ✓ servo : 5 points, 23×23 mm, flanc ép.12 servo miroir=x, 1 trou(s)
  → corps-demo : 3 pièce(s), 2 axe(s), 100×80×31 mm
```

`src/webview/composants/assemblages.mts` est **généré**, et il est **sa propre archive** : l'outil le relit avant de le réécrire, extraire un assemblage ne fait pas disparaître les autres. Comme `profils.mts`, il se lit dans un `git diff` mais ne se modifie pas à la main.

Le banc `verify:assemblage` est du calcul pur, comme celui des profils. Il éprouve la **lecture de l'étiquette** (une position négative doit rester entière — `pos=0,-9,0` a déjà été lu comme trois mots), les **plans** (une plaque de 100 mm posée à plat encombre 100 × 80 × 3, jamais 103 × 83 × 35), le **miroir**, l'**éclaté** (chaque pièce s'écarte du côté où elle est déjà, une pièce centrale ne bouge pas), puis **chaque assemblage rangé** : plan et matière connus, contour centré, cotes conformes, encombrement conforme au calcul, axes dans la boîte.

---

## Aide-mémoire

**Profils** (une pièce) :

- Un profil = **un contour fermé** + ses trous, dans un groupe `<nom>-profil`.
- Plaque = vue de **dessus**, haut du dessin = avant. Pièce = vue de **côté**, gauche → droite = première → seconde articulation.
- Les **proportions** comptent, pas les cotes : tout est remis à l'échelle.
- Un trou doit être **entièrement contenu** dans la pièce, sinon il est ignoré (avec un avertissement).
- Le contour ne doit **jamais se croiser** : c'est le seul tracé que le moteur ne sait pas mettre en volume.
- `profils.mts` est **généré** : on le relit, on ne l'édite pas.
- Extraire un profil ne perd pas les autres.
- Regardez le mode `:plat` **avant** de suspecter le moteur.

**Assemblages** (plusieurs pièces) :

- Une pièce = un groupe `<assemblage>-<pièce>` + **une étiquette de pose** en clair.
- Tout est en **millimètres**, et les cotes sont conservées : c'est un plan de découpe, pas une proportion.
- L'étiquette commence **toujours** par le plan : `dessus`, `flanc` ou `face`.
- `pos` est le **centre** de la pièce, pas son coin.
- `miroir` pose la pièce **deux fois** : un dessin de flanc donne les deux flancs.
- Une **pastille rouge nommée** devient un axe — c'est le dessin qui dit où est la hanche.
- `npm run montre <nom>` relit, range et ouvre : c'est la boucle de travail.
- Le curseur **éclaté** est le seul moyen de voir ce qu'il y a entre deux flancs.
- `assemblages.mts` est **généré**, et il est sa propre archive.
