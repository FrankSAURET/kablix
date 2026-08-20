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
- `behavior` : nom du fichier script optionnel

#### `schema.svg`

Un seul SVG avec groupes optionnels :
- `<g id="<type>">` : dessin externe
- `<g id="<type>-interne">` : schéma interne optionnel

Pastilles rouges (`fill="#ee0000"`) marquent les broches ; texte au-dessus porte le nom.

### Fichiers optionnels

#### `thumbnail.webp`
Miniature 200×150 px (WebP).

#### `behavior.mjs`
Script de simulation embarqué pour l'animation du composant.

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

**Date** : 2026-08-18
