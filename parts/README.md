# Exemple de composant Kablix

Composant partageable au format **`.kablix-part.json`** (le format ouvert
documenté dans l'aide). Le fichier est autonome : dessin SVG + broches + modèle
de simulation. Aucune dépendance, copiable/partageable tel quel.

Ce dossier n'est **pas** la bibliothèque de composants de Kablix : les composants
livrés sont natifs (compilés dans l'extension, palette de gauche). Il ne contient
qu'un **exemple de référence** du format, pour partir d'un fichier qui marche
quand on crée son propre composant.

## Utiliser un composant

Dans le simulateur Kablix, palette → **⇪ Importer (.json)** → choisir le fichier.
Le composant (★) apparaît dans la palette, prêt à poser et à câbler. Les broches
sont alignées sur la grille de **10 px** (= 0,1″), donc enfichables sur platine.

## Fichier fourni

| Fichier | Composant | Broches | Simulation |
|---|---|---|---|
| `hc-sr04.kablix-part.json` | HC-SR04 — capteur ultrason | VCC/Trig/Echo/GND | **simulé** : TRIG → ECHO (largeur = distance × 58 µs ; distance via l'attribut `distance`) — familles AVR **et** RP2040 |

> Kablix embarque déjà un capteur ultrason natif : importer ce fichier ajoute donc
> une entrée ★ **en plus** de celle de la palette. C'est voulu — l'intérêt est de
> disposer d'un modèle complet à copier, pas d'ajouter une fonction manquante.

## Composants retirés de ce dossier

Ils sont devenus **natifs** ; leurs anciens `.json` sont conservés dans
[`A Examiner/parts/`](../A%20Examiner/parts) pour référence.

| Ancien `.json` | Devenu natif |
|---|---|
| `lcd1602-i2c` | `kablix-lcd1602` — type `lcd`, catégorie Afficheurs |
| `picow-module` | `kablix-pico-board` — type `picow` (dessin repris dans [`pico-board.mts`](../src/webview/composants/pico-board.mts)) |
| `grove-pico` | `kablix-grove-pico` — v2026.7.114, avec enfichage de la Pico et switch 3V3/5V |
| `pca9685` | `kablix-pca9685` — v2026.7.116, catégorie Divers, alimentation externe simulée |

## Régénérer / ajouter

Le fichier est produit depuis le dessin de [`media/parts/`](../media/parts) par le
générateur :

```bash
npm run build:parts
```

Pour ajouter un composant : déposer son `.svg` dans `media/parts/`, ajouter une
entrée `SPECS` (nom, modèle, brochage par bord) dans
[`scripts/build-parts.mjs`](../scripts/build-parts.mjs), relancer le générateur.
Le générateur superpose des pastilles de broche étiquetées sur la grille de
10 px, ce qui garantit que les points de connexion tombent toujours sur la grille.

On peut aussi créer un composant entièrement à la main (ou via une IA) : voir la
rubrique **« Créer un composant avec une IA »** de l'aide de l'extension.
