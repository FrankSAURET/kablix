# Dessiner les systèmes en volume (araignée, pattes, plaques)

Le robot araignée et sa patte ne sont pas des SVG posés à l'écran : ce sont des **volumes calculés à chaque image** par le moteur isométrique [`iso3d.mts`](../../src/webview/composants/iso3d.mts). C'est ce qui permet à une patte de se lever pour de bon — un dessin plat, lui, donnait la même image qu'on tourne la hanche ou qu'on plie le genou.

Le prix à payer était que les formes étaient **codées en dur** : le châssis, c'était `regularPoly(8, 55)`, un octogone ; les os, des pavés. Aucun coup de crayon là-dedans. Ce guide décrit la voie ouverte depuis la v2026.8.23 : **vous dessinez le contour d'une pièce, le moteur le met en volume**. Le dessin reste de votre main, la cinématique, l'ombrage et le tri en profondeur restent au moteur.

Ce guide s'adresse à qui travaille sur **le dépôt**. Pour un composant plat classique (une diode, un capteur), la chaîne est différente et décrite dans [Créer un composant Kablix](Creating-components.md).

Pressé ? Sautez à [dessin d'origine, ce que ça donne](#dessin-dorigine-ce-que-ca-donne) : trois images valent la page.

---

## Ce qu'il faut avoir

- Le dépôt cloné, `npm install` passé, Node 20+.
- **Inkscape** (ou tout éditeur SVG) pour dessiner dans `Composants.svg`.
- **Chrome / Chromium** installé : la lecture des contours passe par un navigateur sans interface. Aplatir à la main des courbes de Bézier et des arcs elliptiques en Node serait du code faux à écrire deux fois — `getPointAtLength` le fait juste, et gratuitement.

---

## La chaîne en un coup d'œil

| # | Étape | Commande / fichier |
| --- | --- | --- |
| 1 | Dessiner le contour de la pièce | `Composants.svg`, groupe `<nom>-profil` |
| 2 | Le lire | `node scripts/_extract-profils.mjs <nom>` → `src/webview/composants/profils.mts` |
| 3 | Le regarder | `node scripts/_capture-profil.mjs <nom>:plat` puis `<nom>:plaque` ou `<nom>:piece` |
| 4 | Le mettre en volume | rien à faire si le nom est déjà attendu (tableau plus bas), sinon l'élément |
| 5 | Contrôler | `npm run verify:profils` |

L'étape 4 est vide dans le cas courant : les composants **cherchent déjà** leurs profils par leur nom et retombent sur la forme codée en dur tant que le dessin n'existe pas. Dessiner `araignee-chassis` puis l'extraire suffit à changer la silhouette du robot, sans toucher une ligne de TypeScript.

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
| `patte-femur` | os hanche → genou | pièce | pavé |
| `patte-tibia` | os genou → pied | pièce | pavé |

---

## Le lire

```bash
node scripts/_extract-profils.mjs araignee-chassis patte-femur
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

## Aide-mémoire

- Un profil = **un contour fermé** + ses trous, dans un groupe `<nom>-profil`.
- Plaque = vue de **dessus**, haut du dessin = avant. Pièce = vue de **côté**, gauche → droite = première → seconde articulation.
- Les **proportions** comptent, pas les cotes : tout est remis à l'échelle.
- Un trou doit être **entièrement contenu** dans la pièce, sinon il est ignoré (avec un avertissement).
- Le contour ne doit **jamais se croiser** : c'est le seul tracé que le moteur ne sait pas mettre en volume.
- `profils.mts` est **généré** : on le relit, on ne l'édite pas.
- Extraire un profil ne perd pas les autres.
- Regardez le mode `:plat` **avant** de suspecter le moteur.
