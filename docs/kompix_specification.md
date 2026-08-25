# Format .kompix — Composants Kablix

Spécification du format d'empaquetage `.kompix` pour les composants Kablix.

## Vue d'ensemble

Un fichier `.kompix` est une **archive ZIP** contenant tous les éléments d'un composant Kablix : dessin externe (SVG), optionnellement schéma interne, métadonnées, code de simulation embarqué.

C'est le seul format utilisé par :
- Le **créateur intégré** de Kablix (bouton *+ Créer un composant*) → exporte en `.kompix`
- Le **gestionnaire de composants** (bouton *⚙ Gérer les composants*) → télécharge `.kompix`
- La **bibliothèque locale** (`kablix_components/`) → stocke les `.kompix`

## Structure

### Fichiers obligatoires

#### `manifest.json`

Métadonnées du composant (JSON structuré). Reprend le schéma `CustomPartData`, avec en plus :
- `kompixVersion` : version du format (1)
- `type`, `label`, `description`, `version`, `author` : identité du composant
- `kind`, `category`, `board` : classification
- `pins` : liste des pattes avec positions
- `pinRoles`, `attrs`, `params`, `control` : paramétrage
- `openDrain` : sortie à collecteur ouvert (rappel au plus obligatoire, voir plus bas)
- `behavior` : nom du fichier script optionnel
- `help` : langues des fiches d'aide embarquées, ex. `["fr"]`
- `l10n` : traductions des libellés du composant (voir plus bas)

#### `schema.svg`

Un seul SVG avec groupes optionnels :
- `<g id="<type>">` : dessin externe
- `<g id="<type>-interne">` : schéma interne optionnel

Pastilles rouges (`fill="#ee0000"`) marquent les broches ; texte au-dessus porte le nom.

### Propriétés et contrôle de simulation

Les deux vivent dans le manifeste — un composant de bibliothèque est donc
**réglable** et **pilotable** sans une ligne de code.

`params` : les propriétés du composant, affichées comme champs numériques du
volet des propriétés et rangées dans l'instance sous `prm_<nom>` (le projecteur
DMX y met son adresse). Chaque entrée porte `name` (utilisable dans les
expressions), `label` (affiché) et `value` (valeur par défaut).

```json
"params": [ { "name": "address", "label": "DMX address", "value": 1 } ]
```

`control` : le contrôle affiché **sur le composant pendant la simulation**,
comme pour les capteurs intégrés. `null` ou absent = pas de contrôle.

| Champ | Rôle |
|-------|------|
| `type` | `slider` (source analogique) ou `switch` (source numérique 0/1) |
| `label`, `unit` | Libellé et unité affichés à côté du contrôle |
| `min`, `max`, `step` | Course du curseur |
| `expr` | Tension de sortie en volts, `f(x, paramètres)` ; à défaut, rampe linéaire min→max vers 0→Vref |
| `move` | Pièce du DESSIN que le contrôle déplace : `{ "group": "obstacle", "dx": 0, "dy": -40 }` |

```json
"control": { "type": "slider", "label": "Illuminance", "unit": "Lx",
             "min": 1, "max": 10000, "expr": "5 * r1 / (r1 + x)" }
```

Un `control` remplace le champ statique de l'inspecteur qui pilotait la même
sortie (« Position (%) » d'une source analogique, « State » d'une source
numérique) : il n'y a jamais deux réglages pour une seule sortie.

#### `control.move` — une pièce du dessin qui bouge

Un composant peut avoir une pièce mobile : l'obstacle d'une barrière optique
monte quand on coche sa case. `move` la désigne par l'**id de son groupe** dans
`schema.svg`, et donne le déplacement (`dx`, `dy`) atteint quand l'interrupteur
est fermé — ou le curseur au maximum, la pièce suivant alors la course.

```json
"control": { "type": "switch", "label": "Obstacle",
             "move": { "group": "obstacle", "dy": -40 } }
```

- Le déplacement est en **pixels du dessin** (repère du `viewBox`) : Kablix
  divise par l'échelle du groupe parent, donc la distance est la même quelle
  que soit la planche d'origine.
- Hors simulation, la pièce revient **exactement** là où elle est dessinée.
- C'est déclaratif par nécessité : un `behavior.mjs` ne voit que les pattes,
  jamais le dessin.

### `openDrain` — la sortie ne sait que tirer à la masse

Une sortie à **collecteur ouvert** (ou drain ouvert) ne pousse jamais vers le
haut : sans résistance de rappel au plus — câblée sur la planche, ou le rappel
interne du microcontrôleur (`INPUT_PULLUP`, `Pin.PULL_UP`) — elle reste muette.
Le déclarer laisse Kablix vérifier le montage et prendre la main sur la sortie.

```json
"openDrain": { "out": "Out", "supplies": [["Vcc.e", "GND.e"], ["Vcc.r", "GND.r"]] }
```

| Champ | Rôle |
|-------|------|
| `out` | Nom de la patte de sortie |
| `supplies` | Paires `[V+, GND]` qui doivent **toutes** être alimentées |

Une barrière optique en a deux, une par barillet : l'émetteur non alimenté
n'éclaire rien, même parfaitement rappelé. Kablix signale alors trois pannes
sur le composant : pas alimenté, sortie soudée en direct au plus
(court-circuit), aucun rappel.

### `l10n` — les libellés traduits

Les champs de premier niveau (`label`, `description`, les `label` de `params` et
de `control`) sont écrits dans la **langue de base** du paquet. Ils ne passent
pas par le catalogue de traduction de Kablix, qui ne connaît que ses composants
intégrés : un composant de bibliothèque emporte donc **ses** traductions dans
son manifeste.

```json
"l10n": {
  "fr": {
    "label": "Projecteur DMX PAR 38",
    "description": "Projecteur à LED PAR 38 piloté en DMX512…",
    "params": { "address": "Adresse DMX (canaux : rouge, vert, bleu)" },
    "control": { "label": "Niveau", "unit": "lux" }
  }
}
```

- Une clé par langue, celle de VS Code (`vscode.env.language`). `fr-CA` cherche
  d'abord `fr-ca`, puis **`fr`** — jamais un retour surprise à l'anglais.
- La langue de base sert de repli **champ par champ** : une traduction partielle
  ne troue pas la fiche, un composant sans bloc `l10n` s'affiche tel qu'il est
  écrit.
- Les `params` se traduisent **par `name`**, pas par position : renommer un
  libellé ne déplace pas les traductions.
- La traduction touche l'affichage, jamais le fond : `name` d'une propriété,
  `expr` d'un contrôle et brochage restent identiques dans toutes les langues.
- **Réenregistrer** un composant (créateur, export) rend au manifeste sa langue
  de base et recopie le bloc `l10n` : la webview ne voit que du traduit, sans
  cette précaution le français serait gravé en langue de base et les autres
  langues perdues. Un libellé **retouché à la main**, lui, est gardé tel quel.

Le gestionnaire de composants lit ce bloc **depuis `index.json`** : la carte d'un
composant pas encore installé est dessinée avant tout téléchargement.
`scripts/build-kompix.mjs` reporte le bloc de `_sources.json` dans le manifeste,
`scripts/build-components-index.mjs` le reporte du manifeste dans l'index.

### Fichiers optionnels

#### `thumbnail.webp`
Miniature 200×150 px (WebP).

#### `behavior.mjs`
Script de simulation embarqué pour l'animation du composant.

#### `help/<lang>.md` — la fiche d'aide

La documentation du composant, **une par langue** (`help/fr.md`, `help/en.md`) :
c'est elle qu'ouvre le bouton *Aide du composant* du volet des propriétés. Un
composant de bibliothèque n'a rien dans `docs/` — sa fiche voyage dans son paquet.

- Même Markdown que les fiches livrées avec Kablix : titre `#`, tableau des
  pattes, tableau des propriétés, utilisation. Le **titre** donne son nom à
  l'onglet du panneau d'aide.
- Les **illustrations** se posent à côté (`help/montage.webp`) et se citent en
  chemin relatif : `![Montage](montage.webp)`. Elles sont rendues en `data:` URI,
  rien n'est lu sur le disque.
- Un lien `[LED](led.md)` ouvre la fiche de l'autre composant, qu'elle vienne de
  Kablix ou d'un autre `.kompix` installé.
- Ce sont les **fichiers présents** qui font foi, pas la liste `help` du
  manifeste : une langue annoncée mais absente n'allume pas le bouton. La langue
  de VS Code est servie si elle est là, sinon la première disponible.

`scripts/build-kompix.mjs` prend ces fiches dans
`kablix_components/help/<type>/<lang>.md` et ajoute d'office l'illustration
`help/<type>.webp` (le dessin du composant en 600 × 450, rendu par Chrome —
jamais une capture d'écran à la main).

## API Behavior (behavior.mjs)

Vrai **module ES** (il est chargé dans un `<script type="module">`), exportant une
fonction obligatoire, `tick`, et deux facultatives :

```javascript
export function init(context) { }     // une fois, au branchement du composant
export function tick(context) { }     // à chaque image de la simulation
export function destroy(context) { }  // à l'arrêt de la simulation
```

Les trois sont appelées de façon **synchrone** : `tick` tourne à chaque image, une
promesse renvoyée ne serait jamais attendue. Pas d'`async`.

Objet `context` expose :
- `pinInfo[]` : brochage
- `readPin(name)` → `0` | `1`, `writePin(name, 0 | 1)` : niveaux logiques, pas des tensions
- `active` : alimentation
- `controlValue`, `switchOn` : contrôles

## Modèle de confiance

**Locaux** (créateur, montre.mjs) : exécution directe, pas d'avertissement.

**Distants** (gestionnaire) : avertissement à première utilisation, confirmation mémorisée par hash SHA256.

## Intégration

1. Créateur → Enregistrer → `.kompix` dans `kablix_components/`
2. Montre.mjs → Intégrer → `.kompix` direct
3. Gestionnaire → Télécharger → `.kompix` depuis dépôt
4. Export → `.kompix` (save-as)

---

**Date** : 2026-08-21
