# Modifier les SVG des composants (et leurs schémas internes)

Ce guide explique **comment retoucher soi-même le dessin SVG d'un composant** Kablix, et **comment fonctionnent / se modifient les schémas internes** (le câblage affiché en transparence quand un composant est sélectionné).

> Si vous faites ça c'est sûrement pour une bonne raison. Merci de m'envoyer la version corrigée ou faites une demande de publication.
---

## 1. Les deux familles de composants

| Famille | Dessin SVG | Modifiable par l'utilisateur ? |
| --- | --- | --- |
| **Composants intégrés** (`@wokwi/elements` : Uno, LED, résistance…) | dans le paquet `node_modules/@wokwi/elements` | Non directement (lecture seule) — voir §4 |
| **Composants personnalisés** (`.kablix-part.json`) | champ `svg` du fichier JSON | **Oui**, librement |

Le plus simple pour avoir la main sur un dessin est donc de passer par un **composant personnalisé** : soit en le créant, soit en exportant un composant existant pour repartir de sa base.

---

## 2. Règle d'or : la grille de 10 px

Toutes les broches doivent tomber sur une **grille de 10 px** (= 0,1″, le pas des trous d'une platine d'essai et de la grille du canvas). Sinon le composant ne s'enfiche pas proprement.

- Travaillez avec un **document SVG dont la grille fait 10 px**.
- Placez chaque point de connexion (`pins[].x` / `pins[].y`) sur un multiple de 10.
- `x`/`y` sont en **pixels, relatifs au coin haut-gauche** de la balise `<svg>` (donc dépendants de `width`/`height` et du `viewBox`).

> Astuce : les cartes `@wokwi/elements` sont au pas physique 9,6 px ; Kablix les agrandit automatiquement (`pinScale = 10/9,6`, voir `catalog.mts`). Pour un composant **personnalisé**, dessinez directement au pas de 10 px.

---

## 3. Modifier le SVG d'un composant personnalisé

### a. Récupérer une base

- Palette → **⇪ Importer (.json)** d'un fichier existant, ou
- bouton **+ Créer un composant** (palette) → l'éditeur intégré, ou
- partez d'un fichier du dossier [`parts/`](../../parts) (ex. `picow-module.kablix-part.json`).

Un `.kablix-part.json` ressemble à :

```json
{
  "label": "Ma LED spéciale",
  "kind": "led",
  "svg": "<svg width=\"40\" height=\"56\" xmlns=\"http://www.w3.org/2000/svg\">…</svg>",
  "pins": [
    { "name": "A", "x": 10, "y": 50 },
    { "name": "K", "x": 30, "y": 50 }
  ],
  "pinRoles": { "A": "plus", "C": "moins" },
  "attrs": {}
}
```

(Format complet : voir l'aide intégrée, section *Format de fichier des composants*, ou [`docs/UTILISATION.md`](UTILISATION.md).)

### b. Éditer le dessin

Deux méthodes :

1. **À la main (texte)** : le champ `svg` est une chaîne SVG. Modifiez les couleurs (`fill`, `stroke`), les formes (`rect`, `circle`, `path`)… Pensez à **échapper les guillemets** (`\"`) puisque le SVG est dans une chaîne JSON.

2. **Dans Inkscape / un éditeur SVG** :
   - réglez le document sur une grille de 10 px ;
   - dessinez le composant, posez les broches sur la grille ;
   - **Fichier → Enregistrer sous → SVG simple (Plain SVG)** ;
   - ouvrez le `.svg`, copiez tout le contenu `<svg>…</svg>` sur **une seule ligne**, et collez-le (échappé) dans le champ `svg` du JSON.

### c. Contraintes de dessin

- Donnez des `width`/`height` raisonnables (40 à 200 px) c'est sa taille à l'écran. N'hésitez pas à compter les carreaux (10px) sur kablix d'uncomposant ressemblant.
- **Évitez `<style>` et les scripts** ; préférez les attributs de présentation (`fill`, `stroke`, `stroke-width`…). Ils survivent à l'export SVG du schéma.
- Dessinez une pastille visible (petit cercle) là où vous déclarez chaque `pin`, pour vous repérer — le point de connexion reste le **centre** de `(x, y)`.

### d. Réimporter

Palette → **⇪ Importer (.json)**. Le composant (★) apparaît, prêt à poser. Pour ajuster finement, **+ Créer / Modifier** ouvre l'éditeur : l'aperçu est zoomable (−/+) et chaque broche a des champs **X / Y éditables** directement.

---

## 4. Et les composants intégrés (@wokwi/elements) ?

Leurs SVG vivent dans `node_modules/@wokwi/elements/dist/esm/*-element.js` (licence MIT) et sont **embarqués au build** : on ne les modifie pas depuis l'interface. Deux options :

- **Recommandé** : recréez une variante en **composant personnalisé** (§3) et utilisez-la à la place.
- **Avancé** (recompilation) : la carte Pico est un élément « maison » ([`src/webview/composants/pico-board.mts`](../../src/webview/composants/pico-board.mts)), qui reprend le dessin de `parts/picow-module` et ajoute marges + noms de broches. C'est le modèle à suivre pour fabriquer un élément intégré sur mesure.

---

## 5. Modifier les schémas internes (vue K)

Le **schéma interne** est le câblage affiché en transparence (sur fond blanc) ou le brochage (pour les cartes µC) quand on sélectionne un composant et qu'on clique le bouton **K**. Il n'est **pas** stocké dans le `.kablix-part.json` : il est **généré par le code**, dans [`src/webview/diagram/internal-wiring.mts`](../../src/webview/diagram/internal-wiring.mts) (modification = recompilation de l'extension).

### Principe

- Une fonction par type de composant (`led`, `resistor`, `buzzer`, `led-bar`, `7segment`, `pushbutton`…).
- Le dispatch se fait par **`kind`** dans `internalWiringSvg(kind, pins, attrs)`.
- Les tracés sont dans le **même repère que les broches `pinInfo`** : ils suivent donc automatiquement la rotation et le retournement du composant.

### Outils fournis

```ts
line(a, b)                 // segment entre deux points {x,y}
dot(p, r?)                 // pastille (nœud) noire
mid(a, b)                  // milieu de [a,b]
diode(from, to, catEnd)    // symbole diode A→K (barre côté `to` si catEnd)
find(pins, 'NOM')          // position {x,y} d'une broche par son nom (ou null)
```

### Ajouter / modifier un schéma

1. Écrivez une fonction `monComposant(pins, attrs?): string | null` qui retourne un fragment SVG (assemblé avec `line`/`dot`/`diode`), ou `null` si les broches attendues manquent (`find` renvoie `null`).
2. Ajoutez un `case '<kind>':` dans le `switch` de `internalWiringSvg`.
3. Recompilez (`npm run build`). Le bouton K apparaît automatiquement sur les composants de ce `kind` (cf. `editor.mts`, `internalWiringSvg(...)`).

> Exemple : `sevenSegment(pins, attrs)` lit `attrs.common` (`cathode`/`anode`) pour orienter ses 8 diodes vers le commun — un schéma peut donc **varier selon un attribut** du composant.

---

## 6. Récapitulatif

| Je veux… | Où agir |
| --- | --- |
| Changer le **dessin** d'un composant perso | champ `svg` du `.kablix-part.json` (§3) |
| Ajouter mes **broches** au pas de 10 px | tableau `pins` du JSON (§2) |
| Modifier un composant **intégré** | en refaire une version perso (§4) |
| Changer le **schéma interne** (vue K) | `src/webview/diagram/internal-wiring.mts` (§5) |
