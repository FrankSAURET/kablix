# Créer un composant 2D — la carte moteur Joy-it SBC-MotoDriver3

Scénario complet, pas à pas, **pour une vidéo explicative**. On part de rien et on
arrive à un composant posable, câblable, simulé, testé et documenté.

Le composant choisi n'est pas un prétexte : la **MotoDriver3** de Joy-it fait
travailler toute la chaîne d'un coup — un bus I²C, quatre sorties de puissance,
une alimentation séparée, et de vrais défauts de câblage à signaler. Un composant
à deux pattes n'aurait montré qu'un quart du chemin.

> **Le dessin n'est pas dans ce scénario.** À l'étape 1 on dit « on dessine la
> carte » et on passe à la suite : dessiner est un métier à part, traité dans
> [Modifier les SVG des composants](docs/fr/Editing-svg-components.md). Ici, ce qui
> nous intéresse c'est **tout ce qui vient après le dessin**.

**Le guide de référence** derrière ce scénario :
[Créer un composant Kablix](docs/fr/Creating-components.md). Ce fichier-ci en est
le déroulé filmé, sur un cas réel.

---

## La carte, en trois lignes

| | |
| --- | --- |
| Nom | Joy-it SBC-MotoDriver3 |
| Ce qu'elle fait | pilote **4 moteurs à courant continu** (ou 2 moteurs pas à pas) |
| Comment on lui parle | **I²C**, adresse **0x15** par défaut (ponts à souder pour en changer) |
| Dedans | un **PCA9634** (16 sorties MLI, côté bus) qui commande deux **DRV8833** (les ponts en H, côté puissance) |
| Alimentation moteurs | **4 à 10 V** sur `VM` / bornier `DC in` — **séparée** de celle de la carte |
| Courant | 1,5 A par moteur au maximum |

Retenez la **paire de pattes par moteur** : un pont en H a deux entrées. À
`(AIN1, AIN2) = (1, 0)` le moteur tourne dans un sens, à `(0, 1)` dans l'autre,
à `(0, 0)` il est en roue libre, à `(1, 1)` il freine. La vitesse vient de la
MLI que le PCA9634 applique sur ces entrées. **C'est tout le modèle de
simulation** — le reste n'est que plomberie.

---

## Avant de commencer

- Le dépôt cloné, `npm install` passé, Node 20+.
- **Chrome / Chromium** installé (extraction et captures passent par un
  navigateur sans interface).
- Inkscape, pour l'étape 1.

Un terminal ouvert à la racine du dépôt, et c'est parti.

---

## Étape 1 — Dessiner la carte

**On dessine la carte** dans `Composants2D.svg`, en suivant les règles de la
planche :

- un groupe dont l'`id` est **`motodriver3`** — ce nom sera le `type` du
  composant partout ailleurs ;
- un second groupe **`motodriver3-interne`** pour le schéma interne (le PCA9634
  et les deux DRV8833, avec leurs liaisons) ;
- les **pastilles rouges** aux points de connexion, chacune avec son nom écrit
  juste au-dessus ;
- **les mêmes pattes, dans le même ordre**, sur le dessin externe et sur le
  schéma interne.

Les pattes de notre carte :

| Nom | Rôle |
| --- | --- |
| `VCC` | alimentation logique (3,3 ou 5 V) |
| `GND` | masse |
| `SDA`, `SCL` | le bus I²C |
| `VM` | alimentation des moteurs (4–10 V) |
| `M1+`, `M1-` … `M4+`, `M4-` | les quatre sorties moteur, deux bornes chacune |

> **Le pas de 10 px est la seule contrainte dure.** Chaque pastille doit tomber
> sur un croisement de la grille. Deux pattes à 9,7 px l'une de l'autre, aucun
> cadre ne le rattrapera.

**À filmer :** la planche dans Inkscape, la palette de groupes, une pastille
sélectionnée avec ses coordonnées visibles dans la barre d'Inkscape.

---

## Étape 2 — Extraire le dessin

```bash
node scripts/_extract-composants.mjs motodriver3
```

Deux fichiers sortent :

```
src/webview/composants/externe/motodriver3.svg
src/webview/composants/interne/motodriver3-interne.svg
```

Et surtout, **la commande affiche le cadre retenu et la position de chaque
patte**. C'est cette liste qu'on recopie à l'étape suivante — on ne la retape
pas de tête, on la copie.

```text
  motodriver3 : cadre 140×110, 14 patte(s)
    VCC   10,10      GND   20,10
    SDA   30,10      SCL   40,10
    VM   130,10
    M1+   10,100     M1-   20,100
    ...
```

> Besoin de vérifier le dessin avant de l'écrire dans `src/` ? `--png` produit
> seulement un aperçu.

**À filmer :** la commande, sa sortie, les deux fichiers qui apparaissent.

---

## Étape 3 — Écrire l'élément

Nouveau fichier `src/webview/composants/motodriver3-element.mts`. C'est un
élément **Lit sans décorateurs** (`static properties` + `declare`) — la
convention du dépôt depuis la v2026.6.87.

```ts
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/motodriver3.svg';

export class MotoDriver3Element extends LitElement {
  // Adresse I²C : 0x15 par défaut, changeable par ponts à souder.
  declare address: string;

  static properties = {
    address: { type: String },
  };

  constructor() {
    super();
    this.address = '0x15';
  }

  // Broches : centre des pastilles, telles que l'extraction les a données.
  readonly pinInfo: ElementPin[] = [
    { name: 'VCC', x: 10, y: 10, signals: [{ type: 'power', signal: 'VCC' }] },
    { name: 'GND', x: 20, y: 10, signals: [{ type: 'power', signal: 'GND' }] },
    { name: 'SDA', x: 30, y: 10, signals: [{ type: 'i2c', signal: 'SDA' }] },
    { name: 'SCL', x: 40, y: 10, signals: [{ type: 'i2c', signal: 'SCL' }] },
    { name: 'VM', x: 130, y: 10, signals: [] },
    { name: 'M1+', x: 10, y: 100, signals: [] },
    { name: 'M1-', x: 20, y: 100, signals: [] },
    // … M2, M3, M4
  ];

  static get styles() {
    return css`
      :host { display: inline-block; }
    `;
  }

  render() {
    return html`
      <svg width="140" height="110" viewBox="0 0 140 110"
           xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-motodriver3')) {
  customElements.define('kablix-motodriver3', MotoDriver3Element);
}
```

Trois pièges, toujours les mêmes :

1. `width`, `height`, `viewBox` **exactement** le cadre annoncé par
   l'extraction ; `pinInfo` **exactement** les positions annoncées.
2. Chaque propriété est déclarée **deux fois** — `declare` pour TypeScript,
   `static properties` pour Lit. Un oubli côté `properties` et l'attribut ne
   redessine rien, en silence.
3. **Rien n'existe tant que le fichier n'est pas importé.** Ajouter, en tête de
   [`src/webview/sim.mts`](src/webview/sim.mts) :
   ```ts
   import './composants/motodriver3-element.mjs';
   ```
   Extension `.mjs` : c'est le nom **compilé**, pas celui du fichier source.

**À filmer :** le fichier écrit à côté de `diode-element.mts` pour montrer la
parenté, puis la ligne ajoutée dans `sim.mts`.

---

## Étape 4 — L'inscrire au catalogue

Sans cette entrée, le composant existe mais n'est **nulle part** dans la
palette. Dans [`catalog.mts`](src/webview/diagram/catalog.mts) :

```ts
{
  type: 'motodriver3',
  label: 'Motor driver (4 channels, I²C)',
  tag: 'kablix-motodriver3',
  kind: 'i2c-motor',
  attrs: { address: '0x15' },
  props: [
    { attr: 'address', label: 'I²C address', kind: 'select',
      options: ['0x15', '0x16', '0x17', '0x18'] },
  ],
},
```

| Champ | Ce qu'il décide |
| --- | --- |
| `type` | l'identifiant du composant — **il ne change jamais** après publication, les projets enregistrés le contiennent |
| `label` | le nom affiché, **écrit en anglais** : c'est la clé de traduction |
| `kind` | la famille de comportement **et** la catégorie de palette |
| `props` | ce que l'inspecteur montre |

Puis le **préfixe de repère** dans
[`refnames.mts`](src/webview/diagram/refnames.mts) : sans lui, la carte posée
s'appellerait comme le fourre-tout par défaut. Ici, `M` conviendrait mal (les
moteurs le prennent déjà) — `DRV` est plus clair.

**À filmer :** la palette avant / après, le composant qu'on pose, le nom
automatique `DRV1` qui apparaît.

---

## Étape 5 — Brancher le schéma interne

Le schéma interne, c'est ce que montre le bouton **K** sur le composant posé.
Dans [`internal-wiring.mts`](src/webview/diagram/internal-wiring.mts) :

```ts
import motodriver3Schema from '../composants/interne/motodriver3-interne.svg';
const MOTODRIVER3_SCHEMA = parseSchema(motodriver3Schema);
```

Comme notre schéma a été **dessiné avec le composant**, il porte le même
`viewBox` : il se superpose tel quel, une mise à l'échelle de la boîte suffit.
(Le cas compliqué — un schéma de boîtier partagé posé par translation — ne nous
concerne pas ici.)

**À filmer :** le clic sur **K**, la transparence qui montre le PCA9634 et les
deux DRV8833 à l'intérieur de la carte.

---

## Étape 6 — La simulation

**C'est la seule étape qui ne se déduit de rien.** Le dessin ne dit pas ce que
fait la carte ; il faut le décider et l'écrire.

Notre carte parle sur un bus : elle va donc dans
[`src/webview/engines/i2c-devices.mts`](src/webview/engines/i2c-devices.mts), à
côté du LCD, de l'OLED et du PCA9685. On y écrit **la conversation, pas
l'électricité**.

### Ce que la carte doit faire

1. **Répondre à son adresse** (0x15 par défaut). Un `scan` I²C doit la trouver.
2. **Mémoriser les registres du PCA9634** que le programme écrit : `MODE1`,
   les `PWMx` (rapport cyclique par sortie), les `LEDOUTx` (sortie active ou
   non).
3. **Traduire chaque paire d'entrées en état moteur.** Pour le moteur 1, les
   sorties du PCA9634 branchées sur `AIN1`/`AIN2` du DRV8833 :

   | `AIN1` | `AIN2` | Moteur |
   | --- | --- | --- |
   | MLI | 0 | tourne en avant, vitesse = le rapport cyclique |
   | 0 | MLI | tourne en arrière |
   | 0 | 0 | roue libre |
   | 1 | 1 | frein |

4. **Faire tourner le moteur posé sur le schéma**, en poussant l'état vers
   l'élément `moteur-dc` câblé sur `M1+`/`M1-`.

### Les défauts à signaler

Un défaut se signale par un **message traduit** qui explique la **cause**, pas
seulement le symptôme :

| Situation | Message |
| --- | --- |
| `VM` non câblé, ou en dehors de 4–10 V | « la carte moteur n'est pas alimentée : `VM` attend 4 à 10 V » |
| `SDA`/`SCL` non reliés au microcontrôleur | « la carte ne reçoit rien : le bus I²C n'est pas câblé » |
| adresse demandée par le programme ≠ adresse du composant | « aucune carte à l'adresse 0x40 — la vôtre est en 0x15 » |
| moteur branché sur une seule borne | « le moteur 1 n'a qu'une borne câblée » |

Ce quatrième cas est celui qui sauve le plus de débutants : sans lui, le moteur
ne tourne simplement pas et rien n'explique pourquoi.

**À filmer :** le montage qui tourne, puis on débranche `VM` en cours de
simulation et le message apparaît.

---

## Étape 7 — Les chaînes

Les chaînes sources sont **en anglais**, dans le code.
[`i18n.mts`](src/webview/i18n.mts) tient le dictionnaire français, clé anglaise
→ traduction. Sont concernés : le `label` du catalogue, les `label` de
propriétés, les noms de pattes affichés, **tous les messages de défaut** de
l'étape 6.

> **Les autres langues attendent.** La règle du dépôt : on tient la **langue de
> base** au fil de l'eau, les traductions se font **en un seul lot avant une
> publication**. `npm run verify:i18n` signalera le manque — c'est normal, ça ne
> bloque pas le lot.

---

## Étape 8 — Les deux tests

**Tout composant a deux tests** : un Arduino (`motodriver3-uno`) et un Pico
(`motodriver3-pico`). Ils ne s'écrivent **jamais à la main** : on décrit le
montage dans [`testkablix/_spec.mjs`](testkablix/_spec.mjs), puis on génère.

```js
test({
  name: 'motodriver3-uno',
  board: 'uno',
  ext: 'ino',
  parts: [
    MCU('uno', 30, 90),
    { id: 'DRV1', type: 'motodriver3', x: 220, y: 90, attrs: { address: '0x15' } },
    { id: 'M1', type: 'moteur-dc', x: 400, y: 60 },
    { id: 'PS1', type: 'alim', x: 220, y: 240, attrs: { voltage: '6' } },
  ],
  wires: [
    ['U1/A4', 'DRV1/SDA'], ['U1/A5', 'DRV1/SCL'],
    ['U1/5V', 'DRV1/VCC'], ['U1/GND', 'DRV1/GND'],
    ['PS1/+', 'DRV1/VM'],  ['PS1/-', 'DRV1/GND'],
    ['DRV1/M1+', 'M1/1'],  ['DRV1/M1-', 'M1/2'],
  ],
  code: `…`,
});
```

Puis :

```bash
node testkablix/_generate.mjs motodriver3-uno motodriver3-pico
```

> ⚠️ **Nommez toujours les tests à générer.** Sans argument, `_generate.mjs`
> réécrit **tout le dossier** depuis la spec — et plusieurs `.ino` / `.py` ont
> été retouchés à la main après génération. De même : un schéma déjà retouché
> **garde les `x`/`y` de sa spec**. Retoucher un test ne redispose pas la
> planche.

Ajoutez enfin la ligne du composant dans `testkablix/README.md`.

**À filmer :** la spec, la génération, puis **on ouvre le test et on le lance** —
le moteur tourne à l'écran.

---

## Étape 9 — La fiche d'aide

Obligatoire : `docs/fr/composants/motodriver3.md`, avec son illustration. Le
français est la langue de base des fiches ; l'anglais attend la publication.

L'image **ne se fait jamais à la capture d'écran** :

```bash
node scripts/_capture-part.mjs motodriver3
```

Le script rend le vrai élément dans Chrome sans interface, sur fond transparent,
et écrit `docs/img/composants/motodriver3.webp`. Il faut d'abord lui décrire la
variante à illustrer dans sa table `PARTS`.

Ce que la fiche doit contenir, dans cet ordre : **ce que fait la carte**, le
**tableau des pattes**, un **montage minimal** qui marche, les **propriétés** de
l'inspecteur, et les **messages de défaut** avec ce qu'ils veulent dire.

**À filmer :** la commande de capture, l'image qui sort, puis le bouton **Aide
du composant** dans le volet des propriétés qui ouvre la fiche.

---

## Étape 10 — Livrer

```bash
npm run typecheck
npm run build
npm run verify:all
```

Puis le rituel du dépôt : `todo.md` à jour (numéro de version **au-dessus** de
ses items), `CHANGELOG.md` complété **côté utilisateur**, `buildNumber` bumpé,
commit, push. Le `.vsix` ne se construit que sur demande.

**À filmer :** les trois commandes vertes, et le composant dans la palette d'une
extension fraîchement construite.

---

## Le comportement de simulation : avec IA et sans IA

Les étapes 2 à 9 sont mécaniques — guidées par des fichiers existants qui
servent de modèle. **L'étape 6 ne l'est pas.** Voici les deux façons de la
faire.

### Sans IA

On l'écrit à la main, en prenant comme modèle le périphérique I²C le plus
proche déjà intégré — ici le **PCA9685** (`i2c-devices.mts`), qui est un
cousin : même famille de circuit, même logique de registres.

La méthode qui marche :

1. **Ouvrir la fiche technique** du PCA9634 et celle du DRV8833. Relever
   uniquement les registres que le programme écrira vraiment (`MODE1`, `PWMx`,
   `LEDOUTx`) — pas les 40 autres.
2. **Copier la structure** du PCA9685 : `write(addr, data)`, un tableau de
   registres, un pointeur d'auto-incrément.
3. **Écrire la table des quatre états** (avant / arrière / roue libre / frein)
   telle qu'elle est plus haut. C'est dix lignes.
4. **Brancher la sortie** sur l'élément moteur câblé, comme le fait déjà le
   `moteur-dc` commandé par transistor.
5. **Éprouver au banc** : un script `scripts/verify-motodriver3.mjs` qui rend le
   vrai éditeur dans Chrome sans interface, lance un programme qui fait tourner
   le moteur dans un sens puis l'autre, et **mesure** le sens de rotation.

Comptez deux bonnes heures. L'essentiel du temps part dans la fiche technique,
pas dans le code.

### Avec une IA

Une IA agentique (Claude Code, par exemple) fait très bien les étapes 2 à 9.
Elle ne fait **pas** le dessin, et elle ne **devine pas** le comportement
électrique attendu — si on ne le lui dit pas, elle inventera un modèle plausible
et faux.

Le fichier `CLAUDE.md` à la racine lui donne déjà les conventions du dépôt :
inutile de les recopier. Ce qu'il faut lui dire, c'est **ce qui n'est écrit
nulle part** :

```text
Ajoute le composant motodriver3 à Kablix. Le dessin et son schéma interne
motodriver3-interne sont dans Composants2D.svg.

La carte : Joy-it SBC-MotoDriver3, un PCA9634 (I²C, adresse 0x15 par défaut)
qui commande deux DRV8833. Quatre moteurs à courant continu, 1,5 A chacun.
Alimentation moteurs VM séparée, 4 à 10 V.

Pattes : VCC, GND, SDA, SCL, VM, puis M1+/M1- à M4+/M4-.
Propriétés : address (liste : 0x15, 0x16, 0x17, 0x18), défaut 0x15.

Simulation : chaque moteur est commandé par une PAIRE d'entrées du pont en H.
(MLI, 0) = avant à la vitesse du rapport cyclique ; (0, MLI) = arrière ;
(0, 0) = roue libre ; (1, 1) = frein. Les registres du PCA9634 à tenir sont
MODE1, PWMx et LEDOUTx.

Défauts à signaler, message expliquant la CAUSE :
- VM absent ou hors 4-10 V ;
- bus I2C non câblé ;
- programme qui écrit à une adresse où il n'y a personne ;
- moteur branché sur une seule borne.

Fais la chaîne complète : extraction, élément, catalogue, préfixe de repère,
schéma interne, simulation dans i2c-devices.mts, chaînes anglaises, tests
motodriver3-uno et motodriver3-pico (GÉNÉRÉS, pas écrits à la main), fiche
d'aide FR avec son illustration capturée. Puis typecheck, build, verify:all.

Prends le pca9685 comme modèle : c'est le périphérique I2C le plus proche.
```

Cette dernière phrase vaut beaucoup d'allers-retours : « fais comme pour le
PCA9685 » donne à l'IA un fichier réel à imiter plutôt qu'un style à deviner.

### Ce qu'il faut relire derrière l'IA

| À vérifier | Pourquoi |
| --- | --- |
| Les positions de `pinInfo` | Un chiffre recopié de travers décale **toutes** les connexions. |
| La table des quatre états | C'est le seul endroit où une IA produit quelque chose de cohérent **et** faux. |
| Les fichiers de test régénérés | `git status` ne doit montrer que les tests du lot. |
| L'illustration de la fiche | Elle doit venir de `_capture-part.mjs`. |
| Le français de la fiche | Les tournures traduites de l'anglais se repèrent tout de suite. |

**Et surtout : la contre-épreuve du banc.** Un banc qui passe avant **et** après
la correction ne prouve rien. On annule la modification (`git stash`), on
relance le banc : il **doit** échouer. Puis on restaure. C'est la règle du
dépôt, et c'est elle qui a rattrapé deux lots livrés verts sur du code mort.

---

## Aide-mémoire du scénario

- Un seul nom, partout : groupe SVG = `type` = nom de la fiche = nom des tests.
- Le centre d'une pastille rouge est le point de connexion ; tout tombe sur la
  grille de 10 px.
- Dessin externe et schéma interne portent les mêmes pattes, dans le même ordre.
- Rien n'est visible tant que l'élément n'est pas **importé dans `sim.mts`** ET
  **inscrit dans `catalog.mts`**.
- Deux tests (Uno + Pico) et une fiche d'aide : ce n'est pas optionnel.
- `_generate.mjs` sans argument écrase tout le dossier de tests.
- Le comportement de simulation ne se déduit jamais du dessin.
