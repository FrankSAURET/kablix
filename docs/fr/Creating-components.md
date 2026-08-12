# Créer un composant Kablix (dessin, schéma interne, simulation)

Ce guide décrit la chaîne complète suivie pour tous les composants ajoutés depuis la v2026.7.229 : **un dessin dans `Composants2D.svg` → un composant posable, câblable, simulé, testé et documenté**. Il s'adresse à qui travaille sur **le dépôt** (composant intégré, recompilation) — pour un composant que l'on garde chez soi, sans toucher au code, la voie rapide reste le fichier `.kablix-part.json` décrit dans [Modifier les SVG des composants](Editing-svg-components.md).

Deux façons de le suivre : [à la main](#à-la-main-la-chaîne-complète), étape par étape, ou [en le faisant faire par une IA](#avec-une-ia) à qui l'on fournit le dessin et les règles du jeu. Les deux passent par les mêmes fichiers — la section IA n'est qu'un raccourci sur la même route.

---

## Ce qu'il faut avoir

- Le dépôt cloné, `npm install` passé, Node 20+.
- **Inkscape** (ou tout éditeur SVG) pour dessiner dans `Composants2D.svg`.
- **Chrome / Chromium** installé : l'extraction et les captures d'illustration passent par un navigateur sans interface (le calcul de géométrie SVG — CTM, `getBBox`, `defs` — n'est pas faisable en expressions régulières).

---

## La chaîne en un coup d'œil

| # | Étape | Fichier(s) touché(s) |
| --- | --- | --- |
| 1 | Dessiner le composant et son schéma interne | `Composants2D.svg` |
| 2 | Extraire les SVG | `src/webview/composants/externe/<type>.svg`, `.../interne/<type>-interne.svg` |
| 3 | Écrire l'élément | `src/webview/composants/<type>-element.mts` + un import dans `src/webview/sim.mts` |
| 4 | L'inscrire au catalogue | `src/webview/diagram/catalog.mts`, `src/webview/diagram/refnames.mts` |
| 5 | Brancher le schéma interne | `src/webview/diagram/internal-wiring.mts` |
| 6 | Lui donner un comportement | `src/webview/diagram/model.mts` ou `src/webview/engines/*.mts` |
| 7 | Traduire | `src/webview/i18n.mts` |
| 8 | Deux fichiers de test (Uno + Pico) | `testkablix/_spec.mjs`, `testkablix/README.md` |
| 9 | La fiche d'aide FR + EN et son illustration | `docs/{fr,en}/composants/<type>.md`, `docs/img/composants/<type>.webp` |
| 10 | Livrer | `todo.md`, `package.json`, build, `verify:all`, commit |

Un composant purement décoratif s'arrête à l'étape 5. Un composant qui doit « faire quelque chose » en simulation fait tout le parcours.

---

## À la main, la chaîne complète

### 1. Dessiner dans `Composants2D.svg`

`Composants2D.svg` est une planche A3 Inkscape (unités **mm**) où vivent les dessins des composants **plats** de la bibliothèque. Les pièces à mettre en volume (profils, assemblages, robot araignée) ont leur propre planche, `Composants3D.svg` — voir [Dessiner les systèmes](Drawing-systems.md). L'ancienne planche unique `Composants.svg` reste lue en repli tant qu'elle est là. Les règles ne sont pas décoratives : l'extracteur s'appuie dessus.

- **Un composant = un groupe dont l'`id` est le nom du composant** (`diode`, `relais`, `moteur-dc`). Ce nom deviendra le `type` du composant dans tout le reste de la chaîne.
- **Son schéma interne = un groupe `<nom>-interne`** (`diode-interne`). Pas de groupe interne = pas de bouton **K** sur le composant, c'est tout.
- Le dessin externe et le schéma interne portent **les mêmes pattes** : mêmes noms, même ordre, mêmes positions. C'est ce qui permet de superposer l'un à l'autre sans recalage.
- Les **pastilles rouges** (cercles `fill:#ee0000`) marquent les points de connexion ; **le centre de la pastille est le point où le fil s'accroche**. Le texte posé juste au-dessus donne **le nom de la patte** (`A`, `K`, `B1`, `VCC`…). `nc` = patte non connectée : dessinée, mais sans point d'accroche.
- Pastilles et libellés sont des **repères de travail** : l'extracteur les retire du dessin livré.

> Le pas de 10 px (0,1″, celui des trous d'une platine d'essai) est la seule contrainte géométrique dure. L'extracteur choisit le cadre livré pour que **chaque pastille tombe sur un multiple de 10 px**, avec au moins 10 px de marge autour ; si votre dessin place deux pattes à 9,7 px l'une de l'autre, aucun cadre ne le rattrapera.

### 2. Extraire les SVG

```bash
node scripts/_extract-composants.mjs diode
```

Sortie : `src/webview/composants/externe/diode.svg` (dessin nettoyé, en pixels de la grille) et, si le groupe existe, `src/webview/composants/interne/diode-interne.svg`. La commande affiche le cadre retenu et la position de chaque patte — **c'est cette liste qui donne les coordonnées à recopier dans `pinInfo`**.

| Option | Effet |
| --- | --- |
| `--png` | Produit seulement un aperçu PNG, sans rien écrire dans `src/` — pour vérifier un dessin en cours. |
| `--drop=id1,id2` | Écarte des éléments du dessin par leur `id` (une étiquette de planche, un repère de construction). |
| `--suffix=-libre` | Ajoute un suffixe au nom de fichier produit (deux variantes du même groupe). |
| `NPN1@to92` | Extrait `NPN1` **comme schéma interne**, calé sur le cadre du boîtier `to92` déjà extrait (voir plus bas). |

Plusieurs noms sur la même ligne de commande sont extraits d'un coup ; un boîtier cité en hôte (`…@to92`) doit figurer **avant** sur la ligne.

> Réextraire un composant réécrit **aussi** son dessin externe. Si le fichier externe avait été retouché depuis (filigrane d'un boîtier, par exemple), récupérez-le par `git checkout` après extraction — et recapturez l'illustration de la fiche.

### 3. Écrire l'élément

Un composant visible est un élément Lit dans `src/webview/composants/<type>-element.mts`. Depuis la v2026.6.87 il n'y a plus aucune dépendance à `@wokwi/elements` : ce sont des **forks locaux**, balises `kablix-*`, **Lit direct sans décorateurs** (`static properties` + `declare`). Le modèle le plus court est [`diode-element.mts`](../../src/webview/composants/diode-element.mts) :

```ts
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/diode.svg';

export class DiodeElement extends LitElement {
  // Tension de seuil (V) — informative côté dessin, utilisée par le modèle.
  declare vf: number;

  static properties = {
    vf: { type: Number },
  };

  constructor() {
    super();
    this.vf = 0.6;
  }

  // Broches : centre des pastilles du dessin (grille de 10 px, K côté bague).
  readonly pinInfo: ElementPin[] = [
    { name: 'K', x: 10, y: 10, signals: [] },
    { name: 'A', x: 50, y: 10, signals: [] },
  ];

  static get styles() {
    return css`
      :host { display: inline-block; }
    `;
  }

  render() {
    return html`
      <svg width="60" height="20" viewBox="0 0 60 20" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-diode')) {
  customElements.define('kablix-diode', DiodeElement);
}
```

Trois points à ne pas rater :

1. `width`, `height` et `viewBox` du `<svg>` reprennent **exactement** le cadre annoncé par l'extracteur ; `pinInfo` reprend **exactement** les positions annoncées.
2. Chaque propriété est déclarée deux fois : `declare` (pour TypeScript) et `static properties` (pour Lit). Un oubli côté `properties` et l'attribut ne redessine rien.
3. Le fichier ne sert à rien tant qu'il n'est pas **importé** : ajoutez `import './composants/<type>-element.mjs';` à la liste en tête de [`src/webview/sim.mts`](../../src/webview/sim.mts) (extension `.mjs`, c'est le nom compilé).

#### Boîtiers partagés (TO-92, TO-220…)

Un boîtier sert à des dizaines de composants : **c'est un dessin, pas un composant**. Son SVG vit dans `src/webview/composants/externe/<boîtier>.svg` et l'élément l'**habille** — l'inscription (`PN`, `2222A`…) est écrite par le composant, jamais par le dessin. Ajouter un boîtier = **une entrée dans la table `PACKAGES`** de [`transistor-element.mts`](../../src/webview/composants/transistor-element.mts), pas un nouvel élément :

```ts
export const PACKAGES = {
  to92:  { svg: to92,  w: 40, h: 50, pinY: 40, pinX: [10, 20, 30], tx: 19.77, cy: 15.47, tw: 11.8, font: 3.8, fill: '#e6e6e6' },
  to220: { svg: to220, w: 60, h: 90, pinY: 80, pinX: [20, 30, 40], tx: 30,    cy: 50.25, tw: 32,   font: 5.5, fill: '#e6e6e6' },
} as const;
```

Deux niveaux cohabitent : la **référence figée** (`pn2222a` — inscription et paramètres fixés) et le **prototype générique** (`npn`, `pnp` — tout est propriété). Un schéma interne de boîtier resservira : gardez-le générique, pattes numérotées 1/2/3 côté prototype, nommées côté référence.

### 4. L'inscrire au catalogue

[`catalog.mts`](../../src/webview/diagram/catalog.mts) est la liste des composants de la palette. Une entrée suffit :

```ts
{
  type: 'diode', label: 'Diode', tag: 'kablix-diode', kind: 'diode', attrs: { vf: '0.6' },
  props: [
    { attr: 'vf', label: 'Threshold voltage (V)', kind: 'number', min: 0, max: 5, step: 0.1 },
  ],
},
```

| Champ | Rôle |
| --- | --- |
| `type` | Identifiant du composant : nom du groupe SVG, nom de la fiche d'aide, nom dans les `.projix`. **Ne change jamais** après publication (les projets enregistrés le contiennent). |
| `label` | Nom affiché, **écrit en anglais** : c'est la clé de traduction (étape 7). |
| `tag` | Balise de l'élément (`kablix-…`). |
| `kind` | Famille de comportement (`diode`, `resistor`, `transistor`, `logic-ic`, `motor`…). Elle décide de la **simulation** ET de la **catégorie de palette** (fonction en fin de `catalog.mts`, ordre dans `CATEGORY_ORDER`). |
| `attrs` | Valeurs par défaut des propriétés, en chaînes. |
| `props` | Ce que l'inspecteur affiche : `number` (avec `min`/`max`/`step`, `suffixes: true` pour les k/M), `select` (avec `options`), `text`. |
| `simControl` | `true` si le composant porte un curseur ou un bouton **pendant la simulation** (voir étape 6). |
| `variant` | `true` pour un type qui reste valide mais **n'apparaît plus** dans la palette (ancienne variante d'un composant regroupé). |

Ajoutez enfin son **préfixe de repère** dans [`refnames.mts`](../../src/webview/diagram/refnames.mts) : la table `FAMILIES` donne le préfixe par langue (`diode: { en: 'D', fr: 'D' }`) et la table suivante rattache le `kind` à sa famille. Sans cela, le composant posé s'appellerait comme le fourre-tout par défaut.

### 5. Brancher le schéma interne

Le schéma interne est le câblage montré en transparence par le bouton **K**. Il est monté dans [`internal-wiring.mts`](../../src/webview/diagram/internal-wiring.mts) :

```ts
import diodeSchema from '../composants/interne/diode-interne.svg';
const DIODE_SCHEMA = parseSchema(diodeSchema);
```

Deux cas :

- **Schéma dessiné avec le composant** (groupe `<nom>-interne`) : même `viewBox` que le dessin externe, donc **superposable tel quel** — une simple mise à l'échelle de la boîte du composant suffit.
- **Schéma de boîtier partagé** (`NPN1`, `PNP1`, `NMOS-D`…) : il est posé **par translation sur la patte 1** (constante `TRANSISTOR_SCHEMA_PIN1`), **jamais par `scale`**. C'est ce qui fait qu'un TO-220, deux fois plus haut qu'un TO-92, garde son symbole à la même distance de ses pattes. Si vous changez le cadre d'un boîtier, cette constante suit.

Un schéma peut varier selon un attribut : l'afficheur 7 segments oriente ses huit diodes vers le commun selon `attrs.common`, les transistors choisissent leur symbole par l'attribut `schema`.

### 6. Lui donner un comportement en simulation

Trois voies, selon la nature du composant. **Ne rien inventer** : le comportement attendu se décide au cas par cas, il ne se déduit pas du dessin.

**a. Composant électrique** — [`model.mts`](../../src/webview/diagram/model.mts). C'est là que vit la netlist : propagation des niveaux (`netLevel`), graphe résistif, ponts diviseurs, courants. Le `kind` sert d'aiguillage. Exemple de la diode : arête **orientée** qui ne se laisse traverser que de A vers K, en perdant sa tension de seuil (`vf`) — ce qui suffit à faire baisser d'autant la tension d'une LED en aval.

**b. Composant réglable pendant la simulation** — `simControl: true` au catalogue. L'éditeur pose alors l'attribut `simulating` sur l'élément quand la simulation tourne (et le retire à l'arrêt) ; l'élément affiche son curseur ou son bouton **uniquement dans cet état**, et émet un événement `input` que `sim.mts` relit pour mettre à jour la valeur. C'est le montage de la LDR, de la CTN, du potentiomètre, des capteurs de flamme et de gaz.

**c. Périphérique de bus ou composant à protocole** — `src/webview/engines/` : `i2c-devices.mts` (LCD, OLED, PCA9685…), `ws2812.mts`, `ultrasonic.mts`, `dht22.mts`. On y implémente la conversation, pas l'électricité.

Un défaut de câblage (roue libre manquante, alimentation hors plage, LED sans résistance) se signale par un message d'erreur **traduit** et, selon les cas, par l'explosion du composant fautif — l'étiquette explique la cause, elle ne se contente pas de la nommer.

### 7. Traduire

Les chaînes sources sont **en anglais** ; [`i18n.mts`](../../src/webview/i18n.mts) tient le dictionnaire français, clé anglaise → traduction. Sont concernés : le `label` du catalogue, les `label` des propriétés, les noms de pattes affichés, les libellés des contrôles de simulation, les messages de défaut. Tout ce que l'utilisateur lit passe par là. `npm run verify:i18n` signale les clés orphelines.

### 8. Les fichiers de test

Tout nouveau composant a **deux** tests : un Arduino (`<type>-uno`) et un Pico (`<type>-pico`). Ils ne s'écrivent pas à la main : on décrit le montage dans [`testkablix/_spec.mjs`](../../testkablix/_spec.mjs) (broches connues du type dans `PART_PINS`, puis un bloc `test({ name, board, ext, parts, wires, code })`), et on génère :

```bash
node testkablix/_generate.mjs diode-uno diode-pico
```

> **Nommez toujours les tests à générer.** Sans argument, `_generate.mjs` réécrit **tous** les fichiers du dossier depuis la spec — et plusieurs `.ino`/`.py` ont été retouchés à la main après génération. De même, un schéma déjà retouché garde les `x`/`y` de sa spec : retoucher un test ne redispose pas la planche.

Ajoutez la ligne du composant dans `testkablix/README.md`, puis un contrôle automatique si le comportement s'y prête : les scripts `scripts/verify-*.mjs` rendent le vrai éditeur dans Chrome sans interface et mesurent le résultat (`npm run verify:transistor`, `verify:motor`, `verify:capacitor`…).

### 9. La fiche d'aide

Obligatoire, **en français et en anglais** : `docs/fr/composants/<type>.md` et `docs/en/composants/<type>.md`, avec au moins une image. L'illustration se produit par capture du vrai élément, jamais par capture d'écran à la main :

```bash
node scripts/_capture-part.mjs diode
```

Le script rend l'élément dans Chrome sans interface, sur fond transparent, et écrit `docs/img/composants/<type>.webp`. Il faut d'abord lui décrire la variante à illustrer dans sa table `PARTS` (module, balise, attributs, largeur de sortie si le composant est étroit et haut). `npm run verify:docs` vérifie ensuite la parité FR/EN, la présence des images et qu'aucun type du catalogue n'est resté sans fiche.

### 10. Livrer

```bash
npm run typecheck
npm run build
npm run verify:all
```

Puis le rituel du dépôt : `todo.md` à jour (numéro de version **au-dessus** de ses items), version bumpée dans `package.json` (`ANNÉE.MOIS.incrément`), commit, push. Le `.vsix` ne se construit que sur demande.

---

## Avec une IA

Une IA agentique (Claude Code, par exemple) fait très bien les étapes 2 à 9 : ce sont des étapes mécaniques, guidées par des fichiers existants qui servent de modèle. Elle ne fait **pas** l'étape 1 — le dessin — et elle ne devine **pas** le comportement électrique attendu.

### Ce qu'elle sait déjà

Le fichier `CLAUDE.md` à la racine du dépôt décrit les conventions (planche `Composants2D.svg`, boîtiers partagés, tests obligatoires, fiche d'aide obligatoire, style de code). Une IA qui lit le dépôt part donc avec les règles en main : inutile de les recopier dans la demande.

### Ce qu'il faut lui dire

Ces cinq points-là ne sont écrits nulle part dans le code :

1. **Le nom exact du groupe** que vous venez de dessiner dans `Composants2D.svg` — le fichier contient aussi des dessins en cours, qu'il ne faut pas embarquer.
2. **Le comportement en simulation**, en clair : « la diode ne passe que de A vers K en perdant `vf` », « si la tension dépasse 1,5 fois la tension nominale, le moteur grille », « sans diode de roue libre, le transistor explose ». Sans cette phrase, l'IA inventera un modèle plausible et faux.
3. **Les propriétés** visibles dans l'inspecteur, avec leurs unités, leurs bornes et leur valeur par défaut.
4. Pour un boîtier partagé : **ce qui est écrit dessus** (une ligne par saut de ligne) et **quel schéma interne** il porte.
5. Ce que vous voulez voir dans les **schémas de test** — sinon elle choisira un montage plausible, à vous de le relire.

### Une demande type

```text
Ajoute le composant <nom> à Kablix. Le dessin et son schéma interne
<nom>-interne sont dans Composants2D.svg.

Pattes : <liste et rôle de chaque patte>.
Propriétés : <nom, unité, bornes, valeur par défaut>.
Simulation : <le comportement en une ou deux phrases, défauts compris>.

Fais la chaîne complète : extraction, élément, catalogue, préfixe de repère,
schéma interne, modèle de simulation, traductions FR/EN, tests <nom>-uno et
<nom>-pico (générés, pas écrits à la main), fiche d'aide FR + EN avec son
illustration capturée. Puis typecheck, build, verify:all.
```

Prenez comme modèle un composant proche déjà intégré (`diode` pour un composant à deux pattes, `transistor` pour un boîtier partagé, `moteur-dc` pour un actionneur à défauts) : « fais comme pour la diode » économise beaucoup d'allers-retours.

### Ce qu'il faut relire derrière elle

| À vérifier | Pourquoi |
| --- | --- |
| Les positions de `pinInfo` | Un chiffre recopié de travers décale toutes les connexions du composant. |
| Le modèle de simulation | C'est le seul endroit où une IA peut produire quelque chose de cohérent **et** faux. |
| Les fichiers de test régénérés | `git status` ne doit montrer que les tests du lot : la génération sans argument écrase tout le dossier. |
| L'illustration de la fiche | Elle doit venir de `_capture-part.mjs`, pas d'une capture d'écran. |
| Le français des fiches et des messages | Les tournures traduites de l'anglais se repèrent tout de suite. |

---

## Aide-mémoire

- Le nom du groupe SVG = le `type` du composant = le nom de sa fiche d'aide = le nom de ses tests. Un seul nom, partout.
- Le centre d'une pastille rouge est le point de connexion ; tout tombe sur la grille de 10 px.
- Dessin externe et schéma interne portent les mêmes pattes, dans le même ordre.
- Un boîtier est un dessin partagé : on l'habille, on ne le duplique pas.
- Rien n'est visible tant que l'élément n'est pas importé dans `sim.mts` **et** inscrit dans `catalog.mts`.
- Deux tests (Uno + Pico) et deux fiches d'aide (FR + EN) : ce n'est pas optionnel.
- `_generate.mjs` sans argument écrase tout le dossier de tests.
