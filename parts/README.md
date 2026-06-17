# Bibliothèque de composants Kablix

Composants partageables au format **`.kablix-part.json`** (le format ouvert
documenté dans l'aide). Chaque fichier est autonome : dessin SVG + broches +
modèle de simulation. Aucune dépendance, copiable/partageable tel quel.

## Utiliser un composant

Dans le simulateur Kablix, palette → **⇪ Importer (.json)** → choisir le fichier.
Le composant (★) apparaît dans la palette, prêt à poser et à câbler. Les broches
sont alignées sur la grille de **10 px** (= 0,1″), donc enfichables sur platine.

## Composants fournis

| Fichier | Composant | Broches | Simulation |
|---|---|---|---|
| `pca9685.kablix-part.json` | PCA9685 — driver PWM 16 canaux | VCC/GND/SCL/SDA/OE/V+ + PWM0–15 | décoratif (câblable) |
| `hc-sr04.kablix-part.json` | HC-SR04 — capteur ultrason | VCC/Trig/Echo/GND | décoratif |
| `lcd1602-i2c.kablix-part.json` | LCD 16×2 I²C | GND/VCC/SDA/SCL | décoratif |
| `grove-pico.kablix-part.json` | Grove Shield pour Pico | ports Grove (alim/I²C/UART/A0-A1) | décoratif |
| `picow-module.kablix-part.json` | Dessin Raspberry Pi Pico W | 40 broches GP/alim | décoratif (la carte simulée se choisit dans le sélecteur) |

> « décoratif » = le composant se place et se câble, mais n'a pas de comportement
> actif simulé (le modèle `kind` du format ne couvre que LED / bouton / résistance
> / buzzer / source numérique / source analogique). Le brochage et le dessin sont
> corrects pour construire et illustrer un montage.

## Régénérer / ajouter

Les fichiers sont produits depuis les dessins de [`media/parts/`](../media/parts)
par le générateur :

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
