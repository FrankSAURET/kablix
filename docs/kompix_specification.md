# Format .kompix (spécification)

## Résumé

Un fichier `.kompix` est une archive ZIP contenant l'intégrité d'un composant de simulation pour Kablix : dessin, broches, paramètres, comportement de simulation optionnel. Un composant `.kompix` s'importe dans la bibliothèque locale `kablix_components/` — unique, partagée entre tous les projets Kablix sur la machine — et réutilisable directement sans étapes manuelles de compilation ou d'intégration.

## Fichiers du `.kompix`

### `manifest.json` (obligatoire)

Métadonnées et configuration du composant, format JSON.

```json
{
  "kompixVersion": 1,
  "type": "diode-power",
  "label": "Diode de puissance",
  "description": "Diode rectifieuse 1A 50V",
  "version": "2026.8.0",
  "author": "Frank",
  "reference": "1N4148",
  "kind": "passive",
  "category": "Passive",
  "board": "uno",
  "pins": [
    { "name": "A", "x": 10, "y": 5 },
    { "name": "C", "x": 30, "y": 5 }
  ],
  "pinRoles": { "A": "anode", "C": "cathode" },
  "attrs": {},
  "params": [],
  "control": null,
  "innerOffset": null,
  "extAnchor": null,
  "intAnchor": null,
  "behavior": null
}
```

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `kompixVersion` | entier | ✅ | Version du format `.kompix`. Actuellement `1`. Permet une évolution future compatible/incompatible. |
| `type` | chaîne | ✅ | Identifiant unique du composant (alphanumérique + tirets, ex. `diode-power`, `7seg-common-cathode`). Doit être unique dans une même installation. |
| `label` | chaîne | ✅ | Nom affiché dans la palette de Kablix. Ex. « Diode de puissance ». |
| `description` | chaîne | ✅ | Phrase courte (< 100 chars), affichée dans le gestionnaire de composants. Ex. « Diode rectifieuse 1A 50V ». |
| `version` | chaîne | ✅ | Version du composant (format calver : `ANNÉE.MOIS.incrément`). Permet la détection des mises à jour dans le gestionnaire. |
| `author` | chaîne | ✅ | Auteur/créateur du composant. |
| `reference` | chaîne | ❌ | Référence commerciale ou numéro de pièce (ex. « 1N4148 »). Optionnel. |
| `kind` | chaîne | ✅ | Type de simulation : `passive`, `led`, `pushbutton`, `resistor`, `buzzer`, `transistor`, `relay`, `digital-source`, `analog-source`, `ultrasonic`, `i2c-lcd`, `i2c-pwm`, `i2c-oled`, `spi-oled`. |
| `category` | chaîne | ❌ | Catégorie de palette (clé de `CATEGORY_ORDER` dans le code Kablix : `Boards`, `Passive`, `Displays & LEDs`, `Controls`, `Sensors`, `Actuators`, `Systems`, `Instruments`, `Misc`, `Integrated circuits`). Absente = « Composants personnalisés ». |
| `board` | chaîne | ❌ | Carte de simulation FOURNIE par ce composant (ex. `pico`, `picow`, `araignee`). Poser ce composant change la cible de simulation. Absent = composant tiers, aucun changement de cible. |
| `pins` | tableau | ✅ | Broches du composant. Chaque entrée : `{ "name": "A", "x": 10, "y": 5 }`. Les coordonnées `x` et `y` sont en pixels **relatifs au coin haut-gauche du SVG externe** (voir `schema.svg` ci-dessous). Les broches doivent être **alignées sur la grille de 10 px**. |
| `pinRoles` | objet | ❌ | Correspondance *rôle de simulation* → *nom de broche*. Ex. `{ "A": "A", "C": "C" }` pour une LED (rôles standards : `A` = anode, `C` = cathode). Si absent, les noms des `pins` sont directement utilisés comme rôles. Voir le tableau des modèles (`kind`) pour les rôles disponibles. |
| `attrs` | objet | ❌ | Attributs initiaux du composant en JSON. Pour `digital-source` : `{ "state": "0" }` ; pour `analog-source` : `{ "value": "50" }`. Laissez vide `{}` ou absent si pas d'attributs. |
| `params` | tableau | ❌ | Paramètres modifiables dans l'inspecteur du composant. Format : `[ { "name": "ohms", "label": "Valeur (Ω)", "value": 1000 } ]`. Voir ci-dessous. |
| `control` | objet | ❌ | Contrôle de simulation (curseur ou interrupteur) affiché **sur le composant** pendant la simulation. Format : voir ci-dessous. |
| `innerOffset` | objet | ❌ | Position `{ "x": 0, "y": 0 }` du coin haut-gauche du schéma interne dans le repère du dessin externe (pour le calage). Calculé automatiquement à la première import si les deux SVG ont des ancres vertes. |
| `extAnchor` | objet | ❌ | Ancre externe détectée à l'import (ne pas remplir manuellement). Format : `{ "x": 50, "y": 50 }`. |
| `intAnchor` | objet | ❌ | Ancre interne détectée à l'import (ne pas remplir manuellement). |
| `behavior` | chaîne | ❌ | Nom du fichier de module de comportement dans l'archive (ex. `behavior.mjs`). Absent ou `null` = composant purement déclaratif (SVG + broches, pas de simulation custom). |

### Paramètres (`params`)

Champs numériques de l'inspecteur et réutilisables dans les expressions du contrôle.

```json
"params": [
  {
    "name": "ohms",
    "label": "Valeur nominale (Ω)",
    "value": 10000
  }
]
```

| Champ | Type | Description |
|-------|------|-------------|
| `name` | chaîne | Identifiant (alphanumérique). Utilisable dans les expressions `control.expr` comme variable `params.ohms`. |
| `label` | chaîne | Étiquette affichée dans l'inspecteur. |
| `value` | nombre | Valeur par défaut. |

### Contrôle de simulation (`control`)

Curseur ou interrupteur visible pendant la simulation, pour ajuster la sortie du composant en temps réel.

#### Curseur (slider)

```json
"control": {
  "type": "slider",
  "label": "Éclairement",
  "unit": "Lx",
  "min": 0,
  "max": 100000,
  "step": 100,
  "expr": "5 - (x / 20000)"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `type` | string | `"slider"` |
| `label` | chaîne | Étiquette du curseur |
| `unit` | chaîne | Unité affichée (ex. « Lx », « %, « °C ») |
| `min` | nombre | Valeur minimale du curseur |
| `max` | nombre | Valeur maximale du curseur |
| `step` | nombre | Pas d'incrémentation |
| `expr` | chaîne | Expression de sortie en **volts**, fonction de `x` (position du curseur dans [min, max]) et des variables `params.*`. Exemple : `3.3 * (x / 100)` pour un curseur 0-100 % ramené à 3,3V (rôle AO). |

#### Interrupteur (switch)

```json
"control": {
  "type": "switch",
  "label": "Allumage"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `type` | string | `"switch"` |
| `label` | chaîne | Étiquette de l'interrupteur |

### `schema.svg` (obligatoire)

Dessin SVG (format standard, encodage UTF-8) contenant DEUX groupes `<g>` (ou éléments racine) à l'aide des conventions suivantes :

- **Dessin externe** : groupe ou élément avec `id="<type>"` (même valeur que `manifest.json::type`). C'est le rendu principal du composant sur le canvas.
- **Schéma interne** (optionnel) : groupe avec `id="<type>-interne"`. Affiché quand on ouvre le composant (bouton « K »). Absent = pas de vue interne.

#### Conventions de dessin

- **Dimensions** : une taille raisonnable, 40–200 px (éch. 1:1 sur le canvas). Adapter `viewBox` et `width`/`height` de la balise racine `<svg>`.
- **Pastilles de broche** : cercles rouges (RGB `#ff0000`, opacité 0,8–1) positionnés exactement aux coordonnées `pins[].x` / `pins[].y` du manifeste. Rayon ~2–4 px suggéré. **Aucune pastille ne sera rendue** : elles sont des marqueurs purs, retirés avant l'affichage.
  ```xml
  <circle cx="10" cy="5" r="2.5" fill="#ff0000" opacity="0.8" />
  ```
- **Texte des broches** : optionnel, placé près de chaque pastille rouge, servira de label au survol.
  ```xml
  <text x="12" y="8" font-size="8" fill="#ff0000">A</text>
  ```
- **Ancre d'alignement du schéma interne** : cercle vert (`#00ff00`, opacité 0,5), même coordonnées dans les deux SVG (externe/interne). Utilisée pour calculer automatiquement `innerOffset` si elle existe dans les deux.
  ```xml
  <!-- Dans le SVG externe -->
  <circle cx="50" cy="50" r="2" fill="#00ff00" opacity="0.5" />
  <!-- Dans le SVG interne (mêmes coordonnées) -->
  <circle cx="50" cy="50" r="2" fill="#00ff00" opacity="0.5" />
  ```
- **Présentation** : attributs directs (`fill`, `stroke`, `stroke-width`…) uniquement — **pas de `<style>` ni de `<script>`**. Les styles inline survivront à l'export SVG ; les règles CSS peuvent se perdre.

#### Exemple complet

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 56" width="40" height="56">
  <!-- Dessin externe de la diode -->
  <g id="diode">
    <!-- Cathode (triangle) -->
    <path d="M 20 10 L 15 20 L 25 20 Z" fill="#333" />
    <!-- Anode (verticale) -->
    <line x1="20" y1="30" x2="20" y2="50" stroke="#333" stroke-width="2" />
    <!-- Pastilles (marqueurs, seront retirées) -->
    <circle cx="10" cy="50" r="2.5" fill="#ff0000" opacity="0.8" />
    <circle cx="30" cy="50" r="2.5" fill="#ff0000" opacity="0.8" />
    <!-- Labels des broches -->
    <text x="8" y="46" font-size="8" fill="#666">A</text>
    <text x="32" y="46" font-size="8" fill="#666">C</text>
    <!-- Ancre verte (optionnelle) -->
    <circle cx="20" cy="28" r="1.5" fill="#00ff00" opacity="0.5" />
  </g>

  <!-- Schéma interne (symbole de la diode) -->
  <g id="diode-interne">
    <!-- Triangle et trait horizontal -->
    <path d="M 5 10 L 0 15 L 10 15 Z" fill="#333" />
    <line x1="0" y1="15" x2="10" y2="15" stroke="#333" stroke-width="1" />
    <!-- Pattes (fictives, ordonnées en A/C) -->
    <circle cx="5" cy="5" r="1.5" fill="#ff0000" opacity="0.8" />
    <circle cx="5" cy="25" r="1.5" fill="#ff0000" opacity="0.8" />
    <!-- Ancre verte (mêmes coords) -->
    <circle cx="5" cy="15" r="1.5" fill="#00ff00" opacity="0.5" />
  </g>
</svg>
```

### `thumbnail.webp` (obligatoire)

Miniature d'aperçu, **200 × 150 px** au maximum, format WebP. Utilisée :
- Localement : affichée en gris dans la palette/dans l'inspecteur du composant.
- Dépôt distant : recopiée en base64 dans `index.json` (voir plus bas).

Générer depuis le dessin du composant (ex. via une capture headless Chrome, voir la section Outils ci-dessous).

### `behavior.mjs` (optionnel)

Module JavaScript ES6 (un seul, pas de dépendances externes ni d'imports). Contient le **comportement de simulation** du composant — lecture des broches à chaque cycle, calcul de l'état, écriture des sorties. N'est chargé que si `manifest.json::behavior` indique ce nom de fichier.

**Sécurité** : voir la section Modèle de confiance ci-dessous.

#### API minimale (à détailler au Lot 2)

Le comportement reçoit un objet `context` fourni à chaque appel du moteur de simulation. Structure (approx.) :

```javascript
// context.pinInfo : tableau des broches du composant
// context.readPin(name) : tension actuelle de la broche (volts)
// context.writePin(name, voltage) : impose une tension de sortie
// context.active : booléen (LED allumée, buzzer actif…)
// context.control : objet { type, value, switchOn, … } si contrôle défini

export function init(context) {
  // Appelé une seule fois, avant la simulation.
  // Préparer les variables d'état, les listeners, etc.
}

export function tick(context) {
  // Appelé à chaque pas de simulation.
  // Lire les pins, calculer, écrire les sorties.
}

export function destroy(context) {
  // Appelé quand le composant est retiré.
  // Nettoyer les ressources.
}
```

**Restrictions** : pas d'accès à `window.parent`, pas de postMessage vers l'extension, pas d'accès direct au DOM global. Le script s'exécute dans le contexte de la webview, mais isolé par scopes.

#### Exemple (capteur LDR avec courbe custom)

```javascript
export function init(context) {
  context.state = { lastLux: 50 };
}

export function tick(context) {
  const lux = context.control?.value ?? 50; // Lecture du curseur du contrôle
  const voltage = 3.3 * (lux / 100000); // Rampe 0→3,3V sur 0→100k Lux
  context.writePin('AO', voltage);
  context.state.lastLux = lux;
}

export function destroy(context) {
  // Nettoyage optionnel
}
```

---

## Dépôt distant : `index.json`

Fichier JSON **généré** à la racine du dossier `kablix_components/` du dépôt distant. Structure :

```json
{
  "version": "2026.8.77",
  "timestamp": "2026-08-18T14:30:00Z",
  "components": [
    {
      "type": "diode-power",
      "label": "Diode de puissance",
      "description": "Diode rectifieuse 1A 50V",
      "version": "2026.8.0",
      "author": "Frank",
      "reference": "1N4148",
      "thumbnail": "data:image/webp;base64,UklGRi…"
    }
  ],
  "total": 1
}
```

Champs :
- `version` : version Kablix actuelle du dépôt.
- `timestamp` : ISO 8601.
- `components` : liste allégée (métadonnées du manifest, pas le code/SVG).
- `thumbnail` : miniature encodée base64 (évite un fetch par composant).

---

## Modèle de confiance et sécurité

### Origine du composant

Chaque `.kompix` porte une **origine** :
- **`local`** : créé par Frank lui-même (créateur intégré, extraction des planches, `montre.mjs`).
- **`remote`** : téléchargé depuis un dépôt distant via le gestionnaire de composants.

### Comportement à la première exécution

#### Origine `local` : exécution directe
Aucune confirmation. Le `behavior.mjs` s'exécute comme le ferait le code d'un fork intégré.

#### Origine `remote` : avertissement bloquant
**Avant le premier tick** du moteur, si le composant dispose d'un `behavior.mjs` et n'a jamais été validé :
1. Une boîte de dialogue **Warning** (hôte d'extension, `vscode.window.showWarningMessage`) affiche :
   > ```
   > Le composant « Diode de puissance » (Frank) exécute du code JavaScript.
   > 
   > Seuls les composants validés par vous sont sûrs à utiliser.
   > Assurez-vous que vous faites confiance à l'auteur, ou contactez-le pour demander une review.
   > 
   > Accepter et faire confiance ? (Ne sera plus demandé si le code n'a pas changé)
   > ```
2. Boutons : **« Accepter »** / **« Refuser »** / **« Plus d'infos »** (lien vers la doc).
3. Si **Refuser** : le composant reste en mode déclaratif (SVG+broches, pas de `behavior.mjs`). Les fils peuvent s'y brancher, mais aucune simulation custom ne tourne.
4. Si **Accepter** : le composant est marqué de confiance. Un **hash SHA-256 du `behavior.mjs`** est mémorisé ; si le code change, la confirmation est redemandée au prochain démarrage.

### Réduction du risque

- **Pas d'accès réseau direct** : le script ne peut pas faire de fetch vers des URLs arbitraires (CSP + isolation).
- **Pas d'eval** : le script s'exécute normalement, pas via `eval` ou similaire.
- **Pas de modification du DOM** : aucune injection de contenu.
- **Validation du manifeste** : un `.kompix` corrompu ou mal formé est rejeté avec un message d'erreur clair.

---

## Génération et outils

### Créer un `.kompix` manuellement

1. **Créer un dossier** avec les fichiers ci-dessus.
2. **Compresser en ZIP** : renommer l'extension `.zip` en `.kompix`.
   ```bash
   zip -r diode-power.kompix manifest.json schema.svg thumbnail.webp
   ```
3. **Placer dans `kablix_components/`** (dossier local) → réappearaît dans la palette.

### Générer la miniature

Script `scripts/_capture-part.mjs` existant, à adapter/réutiliser :
```bash
node scripts/_capture-part.mjs <type>
```
Sort une `thumbnail.webp` au format requis.

### Générer l'`index.json` du dépôt

Script `scripts/build-components-index.mjs` (à créer au Lot 6) :
```bash
npm run build-components-index
```
Lit tous les `.kompix` de `kablix_components/`, génère `index.json` + met à jour `README.md`.

---

## FAQ

**Q. Peut-on avoir plusieurs versions du même composant ?**
R. Non : `type` est la clé unique. Une nouvelle version remplace l'ancienne dans `kablix_components/`. Le champ `version` du manifest permet au gestionnaire de détecter les mises à jour (voir Lot 3).

**Q. Peut-on partager un `.kompix` sans le mettre en dépôt ?**
R. Oui : un fichier `.kompix` isolé peut être copié d'une machine à l'autre et déposé dans le dossier `kablix_components/` du destinataire. Il s'y enregistre immédiatement.

**Q. Peut-on avoir un `.kompix` dans un dossier de projet (ne pas le partager) ?**
R. Oui : tout `.kompix` trouvé dans l'arborescence d'un projet ouvert (`**/*.kompix`) est copié dans `kablix_components/` local. Utilité : partager un composant spécifique aux côtés du code du projet (`composants-perso/mon-capteur.kompix`).

**Q. Le `behavior.mjs` peut-il importer d'autres fichiers ?**
R. Non : le module est UNIQUE, sans dépendances externes. Toute logique doit être autosuffisante. Les imports npm ne sont pas disponibles (pas de bundler côté webview).

---

## Historique des versions du format

| Version | Date | Notes |
|---------|------|-------|
| 1 | 2026-08-18 | Format initial `.kompix`. |
