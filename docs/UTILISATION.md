# Kablix — Guide d'utilisation

Simulateur **Arduino Uno** / **Raspberry Pi Pico** intégré à VS Code, 100% offline.

> English version: [USAGE.en.md](USAGE.en.md)

## Sommaire

1. [Démarrage](#démarrage)
2. [L'interface](#linterface)
3. [Construire un montage](#construire-un-montage)
4. [Exécuter du code](#exécuter-du-code)
5. [MicroPython sur le Pico](#micropython-sur-le-pico)
6. [Déboguer pas à pas](#déboguer-pas-à-pas)
7. [Moniteur série](#moniteur-série)
8. [Exporter le schéma en SVG](#exporter-le-schéma-en-svg)
9. [Créer ses propres composants](#créer-ses-propres-composants)
10. [Format de fichier des composants (.kablix-part.json)](#format-de-fichier-des-composants-kablix-partjson)
11. [Où trouver des composants existants](#où-trouver-des-composants-existants)
12. [Mises à jour des bibliothèques](#mises-à-jour-des-bibliothèques)
13. [Raccourcis clavier](#raccourcis-clavier)

---

## Démarrage

Trois façons d'ouvrir le simulateur :

- **Icône Kablix** dans la barre d'activité (à gauche) → la vue s'ouvre et lance
  le simulateur ;
- Palette de commandes (`Ctrl+Shift+P`) → **« Kablix : Ouvrir le simulateur »** ;
- Commande **« Kablix : Compiler & exécuter le fichier actif »** (ouvre le
  simulateur et y charge le fichier en cours d'édition).

Au premier affichage, la **feuille de dessin est vide** : posez vos composants
depuis la palette, câblez-les, puis cliquez **▶ Démarrer** (programme de
démonstration intégré : LED D13/GP25 clignotante) ou **⚙ Compiler & exécuter
le fichier actif** pour exécuter votre propre code.

## L'interface

```
┌──────────────────────────────────────────────────────────────────┐
│ Kablix  [Carte ▾] [▶ Démarrer] [■] [⚙ Compiler…] [↑ Charger] [⬇ SVG] │
├───────────┬────────────────────────────────────────┬─────────────┤
│ Palette   │                Canvas                  │ Propriétés  │
│ (compo-   │   (composants, fils, poignées…)        │ (compo/fil  │
│  sants)   │                                        │ sélectionné)│
├───────────┴────────────────────────────────────────┴─────────────┤
│ Moniteur série  [sortie]                [champ d'envoi] [Envoyer] │
└──────────────────────────────────────────────────────────────────┘
```

- **Sélecteur de carte** : Arduino Uno ou Raspberry Pi Pico (le montage en
  cours est conservé, la simulation est arrêtée).
- **Palette** : cliquer un composant le pose sur le canvas. Deux tris au choix
  (boutons en haut) : **AZ** (alphabétique) ou **🗂** (par catégories — Cartes &
  platines, Affichage & LED, Commandes, Capteurs, Actionneurs, Passifs). Une
  zone **« Derniers utilisés »** (10 max) reste en tête, et la palette défile
  (ascenseur) si elle dépasse la fenêtre. Les composants personnalisés (★)
  gardent leurs boutons ⇩ (export) et ✕ (suppression du modèle).
- **🏷 Noms** : force l'affichage du nom au-dessus de **tous** les composants.
  Désactivé (défaut), le nom n'apparaît que sur le composant **sélectionné**.
- **Propriétés** (inspecteur) : édite l'élément sélectionné — composant
  (couleur, valeur, angle…) ou fil (couleur Dupont, suppression).

## Construire un montage

### Poser et déplacer

- **Poser** : clic sur un composant de la palette (posé au centre), ou
  **glisser-déposer** depuis la palette vers l'endroit voulu du canvas.
- **Déplacer** : glisser le composant (n'importe où sur son corps), ou
  **glisser avec le clic droit** — indispensable pour les composants
  interactifs (bouton, potentiomètre, interrupteurs, joystick) dont le clic
  gauche actionne le contrôle. On peut aussi les sélectionner (clic gauche)
  puis les glisser par leur **bandeau de nom** qui apparaît au-dessus.
- **Tourner** : sélectionner le composant puis touches **`+`** (45° horaire)
  ou **`-`** (45° antihoraire). Les broches et les fils suivent ; un rappel
  apparaît dans la zone d'aide de l'inspecteur.
- **Zoomer** : **molette** dans le canvas (centré sur le curseur). Le badge
  **⟳ %** en bas à droite donne le facteur ; un clic dessus réinitialise la vue.
- **Supprimer** : ✕ du bandeau (visible à la sélection), bouton 🗑 de
  l'inspecteur, ou touche `Suppr`.

### Platine d'essai

Le composant **Platine d'essai** (catégorie Cartes & platines) existe en trois
tailles — *mini* (17 colonnes, sans rails), *half* (30 colonnes) et *full*
(63 colonnes) — réglables dans **Propriétés**. Les connexions internes réelles
sont simulées : colonnes **a–e** et **f–j** reliées par bande, **rails +/−**
sur toute la longueur.

Pendant le déplacement d'un composant au-dessus de la platine, les **bandes
qui recevraient ses broches s'allument en jaune**. Au relâchement, le
composant s'**enfiche** : il se cale sur les trous et les connexions sont
établies automatiquement (sans fil visible). Les fils passent par-dessus les
cartes et les platines.

### Câbler

1. Cliquer une **broche** (pastille dorée) : le fil démarre.
2. Chaque clic sur le **fond du canvas** pose un **coude**. Les segments
   proches de l'horizontale ou de la verticale (±15°) y sont **aimantés**.
3. Cliquer une **autre broche** termine le fil. `Échap` annule.
4. Le glisser-déposer direct broche → broche fonctionne aussi.

Chaque changement de direction est tracé avec un **arrondi**. Couleurs :

- un fil touchant une **masse** (GND) naît **noir** ;
- un fil touchant une **alimentation** (5V, 3V3, VBUS, VSYS, VCC…) naît **rouge** ;
- les autres suivent la rotation des **nappes Dupont arc-en-ciel** (10 couleurs).

La couleur reste **modifiable d'un clic** dans l'inspecteur — elle n'est jamais
ré-imposée.

### Retoucher un fil

- **Sélectionner le fil** : des **poignées** apparaissent sur chaque coude.
- **Glisser une poignée** pour déplacer le coude.
- **Ctrl maintenu** pendant le glissement : un **réticule horizontal/vertical**
  s'affiche et le coude s'aligne sur ses voisins — les segments deviennent
  exactement horizontaux ou verticaux.
- **Double-clic sur le fil** : insère un nouveau coude à cet endroit.

### Composants disponibles

| Composant | Comportement simulé |
| --- | --- |
| Arduino Uno / Raspberry Pi Pico | Cartes (processeur simulé) |
| Platine d'essai (mini/half/full) | Bandes a–e / f–j et rails +/− conducteurs, enfichage automatique |
| LED, LED RGB, barre de 10 LED | Allumées selon les niveaux des nets (anode haute, cathode basse) |
| Afficheur 7 segments | Segments A–G + point, cathode commune DIG1 |
| Bouton poussoir | Tire la broche MCU à LOW à l'appui (câblé broche ↔ GND) |
| Interrupteur à glissière | Connecte le commun (2) au côté 1 ou 3 |
| DIP switch ×8 | 8 canaux indépendants (na ↔ MCU, nb ↔ GND) |
| Résistance | Relie ses deux pattes (valeur/angle éditables) |
| Buzzer | Note animée quand une tension existe entre ses broches |
| Potentiomètre (rotatif / glissière) | Entrée analogique interactive (A0–A5 Uno, GP26–GP28 Pico) |
| Joystick analogique | 2 axes analogiques (VERT/HORZ) + bouton SEL |
| Photorésistance (LDR) | Sortie analogique AO, luminosité réglée dans Propriétés |
| Détecteur PIR, capteur d'inclinaison | Sortie numérique OUT, état réglé dans Propriétés |
| Servomoteur | Bras à 90° quand la broche PWM est haute (simplifié) |

## Exécuter du code

Bouton **⚙ Compiler & exécuter le fichier actif** (ou la commande homonyme) —
le traitement dépend de l'extension du fichier actif :

| Fichier | Traitement | Prérequis |
| --- | --- | --- |
| `.ino`, `.c`, `.cpp` (carte Uno) | Compilation locale puis exécution | `arduino-cli` **ou** `avr-gcc` |
| `.c`, `.cpp` (carte Pico) | Compilation bare-metal RAM | `arm-none-eabi-gcc` |
| `.py` | MicroPython sur le Pico simulé | firmware `.uf2` (voir ci-dessous) |
| `.hex` | Chargé directement (Uno) | — |
| `.uf2`, `.elf`, `.bin` | Chargé directement (Pico) | — |

Bouton **↑ Charger workspace** (ou commande « Kablix : Charger l'artefact
compilé du workspace ») : détecte et lance le **`.hex` le plus récent**
(dossier de sortie de `.vscode/arduino.json`, sinon scan) ou le **`.uf2` de
`build/`** (projets pico-sdk / cmake / pico-vscode).

## MicroPython sur le Pico

1. Télécharger le firmware officiel :
   [micropython.org/download/RPI_PICO](https://micropython.org/download/RPI_PICO/).
2. Le placer **dans le workspace** (n'importe quel dossier) ou renseigner son
   chemin dans le réglage **`kablix.micropythonUf2`**.
3. Ouvrir un fichier `.py` → **⚙ Compiler & exécuter le fichier actif**.

Le firmware démarre dans le simulateur (bootrom + flash + USB), puis le script
est injecté via le **raw REPL**. Les `print()` apparaissent dans le moniteur
série ; à la fin du script, le **REPL interactif** reste disponible via le
champ d'envoi.

## Déboguer pas à pas

Pensé pour observer un programme en classe, sans débogueur externe.

- **⏸ Pause / ▶ Reprendre** : gèle la simulation ; l'état des broches et des
  LED reste affiché. Le sélecteur 🐇/🐢/🐌 ralentit l'exécution (Uno).
- **⏭ Pas** : exécute une ligne du fichier source puis se remet en pause. Le
  panneau **Variables** (sous le canvas) montre alors la ligne courante et les
  variables globales du programme ; la ligne est aussi surlignée dans
  l'éditeur VS Code.
- **Points d'arrêt** : cliquer dans la gouttière de l'éditeur (à gauche des
  numéros de ligne) avant ou pendant l'exécution ; la simulation se met en
  pause en atteignant la ligne.

Prérequis et limites :

| Langage | Comment | Limites |
| --- | --- | --- |
| C / Arduino (Uno) | infos DWARF extraites à la compilation (`avr-objdump`, fourni avec arduino-cli ou avr-gcc) | variables **globales** simples (int, float, bool…) ; un `delay()` long avance par tranches de 0,25 s simulée |
| MicroPython (Pico) | le script est instrumenté automatiquement avant injection | variables **globales** uniquement ; la pause prend effet à la ligne suivante ; pas de ralenti |

Les artefacts chargés directement (`.hex`, `.uf2`, `.elf`, `.bin`) s'exécutent
sans infos de débogage : pause et ralenti restent disponibles, pas le pas à pas.

## Moniteur série

- **Sortie** : USART (Uno), USB-CDC et UART0 (Pico), en temps réel.
- **Entrée** : champ de saisie + `Entrée` (ou bouton Envoyer). Sur le Pico,
  l'entrée alimente l'USB-CDC (REPL MicroPython) **et** l'UART0.

## Exporter le schéma en SVG

Bouton **⬇ SVG** : le schéma complet (composants avec leurs rotations, fils
colorés avec leurs arrondis) est exporté en **fichier SVG autonome** via un
dialogue de sauvegarde. Utilisable dans un document, un site, une impression…

> Note : quelques composants stylés par CSS interne peuvent perdre des détails
> cosmétiques à l'export ; la géométrie et les couleurs principales sont
> conservées.

## Créer ses propres composants

Bouton **« + Créer un composant »** en bas de la palette :

1. **Nom** : libellé affiché dans la palette.
2. **Modèle de simulation** : définit le comportement électrique —

   | Modèle | Rôles de broches | Comportement |
   | --- | --- | --- |
   | LED | `A` (anode), `C` (cathode) | Halo lumineux si A=haut et C=bas |
   | Bouton poussoir | `1.l`, `2.l` | Clic sur le dessin = appui (broche tirée à LOW) |
   | Résistance | `1`, `2` | Relie électriquement ses deux broches |
   | Buzzer | `1`, `2` | Halo si tension entre les deux broches |
   | Source numérique | `OUT` | État 0/1 réglé dans Propriétés |
   | Source analogique | `AO` | Valeur 0–100 % réglée dans Propriétés |
   | Décoratif | — | Aucun comportement (annotation, habillage) |

3. **Dessin SVG** : collez ou écrivez le code SVG dans la zone de texte ;
   l'aperçu se met à jour en direct.
4. **Points de connexion** : **cliquez l'aperçu** pour poser chaque broche à
   l'endroit voulu, renommez-les dans la liste (✕ pour en retirer une).
5. **Correspondance des rôles** : pour chaque rôle du modèle choisi,
   sélectionnez la broche qui le joue (ex. rôle `A` → votre broche `plus`).
6. **Enregistrer** : le composant apparaît dans la palette (★) et est
   **persisté entre les sessions**.

Gestion depuis la palette : **clic** = poser sur le canvas, **double-clic** =
modifier le modèle, **⇩** = exporter en `.json`, **✕** = supprimer le modèle,
**⇪ Importer (.json)** = charger un composant partagé.

## Format de fichier des composants (.kablix-part.json)

Un composant exporté est un fichier **JSON** autonome :

```json
{
  "type": "custom-m4k2xyz",
  "label": "Ma LED spéciale",
  "kind": "led",
  "svg": "<svg width=\"40\" height=\"56\" xmlns=\"http://www.w3.org/2000/svg\">…</svg>",
  "pins": [
    { "name": "plus",  "x": 12, "y": 50 },
    { "name": "moins", "x": 28, "y": 50 }
  ],
  "pinRoles": { "A": "plus", "C": "moins" },
  "attrs": {}
}
```

| Champ | Type | Description |
| --- | --- | --- |
| `type` | chaîne | Identifiant unique. Généré automatiquement si absent à l'import. |
| `label` | chaîne | **Obligatoire.** Nom affiché dans la palette. |
| `kind` | chaîne | Modèle de simulation : `led`, `pushbutton`, `resistor`, `buzzer`, `digital-source`, `analog-source` ou `passive` (défaut). |
| `svg` | chaîne | **Obligatoire.** Code SVG complet du dessin (balise `<svg>` avec `width`/`height` en pixels). |
| `pins` | tableau | **Obligatoire.** Points de connexion : `name` (unique), `x`, `y` en pixels **relatifs au coin haut-gauche du dessin**. |
| `pinRoles` | objet | Correspondance *rôle du modèle* → *nom de broche* (voir tableau des modèles). Si absent, les broches doivent porter directement le nom du rôle. |
| `attrs` | objet | Attributs initiaux. Pour `digital-source` : `{ "state": "0" }` ; pour `analog-source` : `{ "value": "50" }`. |

Conseils pour le dessin SVG :

- Donnez des `width`/`height` raisonnables (40–200 px) : c'est la taille
  d'affichage sur le canvas.
- Évitez les `<style>` et les scripts ; préférez les attributs de présentation
  (`fill`, `stroke`…) — ils survivent à l'export SVG du schéma.
- Placez visuellement vos pastilles de connexion (cercles dorés par exemple) là
  où vous déclarez les `pins`.

### Faire générer un composant par une IA

Copiez le prompt ci-dessous dans votre assistant IA préféré (Claude, ChatGPT…),
complétez la première ligne, puis importez le JSON obtenu via
**⇪ Importer (.json)** :

```text
Crée un composant pour le simulateur Kablix : [DÉCRIS ICI TON COMPOSANT, ex.
« un module relais 5V avec une LED témoin »].

Réponds UNIQUEMENT avec un fichier JSON valide (aucun texte autour), au format :

{
  "label": "<nom court affiché dans la palette>",
  "kind": "<modèle de simulation, voir liste>",
  "svg": "<dessin SVG complet sur une seule ligne>",
  "pins": [ { "name": "<nom>", "x": <px>, "y": <px> } ],
  "pinRoles": { "<rôle>": "<nom de broche>" },
  "attrs": {}
}

Contraintes :
- "kind" parmi : "led" (allumé si rôle A=haut et C=bas), "pushbutton" (clic =
  broche tirée à GND, rôles 1.l et 2.l), "resistor" (relie les rôles 1 et 2),
  "buzzer" (actif si tension entre rôles 1 et 2), "digital-source" (sortie
  numérique, rôle OUT, état réglé par l'utilisateur), "analog-source" (sortie
  analogique, rôle AO, valeur 0-100 % réglée par l'utilisateur), "passive"
  (décoratif, aucun rôle).
- "pinRoles" : associe chaque rôle du kind choisi au "name" d'une de tes pins.
- "attrs" : { "state": "0" } pour digital-source, { "value": "50" } pour
  analog-source, {} sinon.
- Le SVG : balise <svg> avec width/height en pixels (60 à 200), attributs de
  présentation uniquement (fill, stroke…), pas de <style> ni de script, pas de
  guillemets typographiques. Dessine des pastilles dorées (cercles ~4 px) aux
  positions exactes des pins déclarées.
- Les coordonnées x/y des pins sont en pixels depuis le coin haut-gauche du SVG.
- Échappe correctement les guillemets dans la valeur "svg".
```

L'aide correspondante (rôles, champs, contraintes) est dans la section
[Format de fichier](#format-de-fichier-des-composants-kablix-partjson) — le
prompt en reprend l'essentiel pour que l'IA n'ait besoin d'aucun autre contexte.

## Où trouver des composants existants

- **Intégrés à Kablix** : toute la palette (voir le tableau plus haut) — basée
  sur [@wokwi/elements](https://github.com/wokwi/wokwi-elements) (licence MIT),
  galerie visuelle sur [elements.wokwi.com](https://elements.wokwi.com).
- **Dessins SVG pour vos composants personnalisés** :
  - [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Electronic_component_symbols) (symboles électroniques, licences libres) ;
  - [SVG Repo](https://www.svgrepo.com) et [Openclipart](https://openclipart.org) (dessins libres) ;
  - les sources de [wokwi-elements](https://github.com/wokwi/wokwi-elements/tree/master/src)
    contiennent le SVG de chaque composant (MIT — réutilisable dans un
    composant personnalisé) ;
  - [Fritzing](https://github.com/fritzing/fritzing-parts) (vues « breadboard »
    en SVG, licence CC-BY-SA).
- **Partage** : un composant exporté (`.kablix-part.json`) s'importe sur
  n'importe quel autre poste via **⇪ Importer (.json)** — pratique pour
  distribuer une bibliothèque de classe.

## Mises à jour des bibliothèques

Kablix embarque trois bibliothèques de simulation (`avr8js`, `rp2040js`,
`@wokwi/elements`). L'extension est **hors-ligne par défaut** : aucun service
distant n'est sollicité sans votre accord.

- **Vérification manuelle** : palette de commandes (`Ctrl+Shift+P`) → **« Kablix :
  Vérifier les mises à jour des bibliothèques »**. Kablix interroge alors le
  registre npm et vous indique si une version plus récente existe (ou que tout
  est à jour).
- **Vérification au démarrage** (optionnelle) : activez le réglage
  **`kablix.checkUpdatesOnStartup`** (désactivé par défaut). Une notification
  n'apparaît alors qu'en cas de mise à jour disponible, en silence sinon.

> **Avertissement** : mettre à jour ces bibliothèques peut **casser
> l'extension** (changements d'API). En cas de problème, ouvrez une demande sur
> le dépôt GitHub :
> [github.com/franksauret/kablix/issues](https://github.com/franksauret/kablix/issues).
> Une vérification réseau absente ou échouée reste silencieuse et n'affecte pas
> le fonctionnement hors-ligne.

## Raccourcis clavier

| Touche | Action |
| --- | --- |
| `+` / `=` | Tourner le composant sélectionné de +45° |
| `-` | Tourner de −45° |
| `Suppr` / `Retour arrière` | Supprimer la sélection (composant ou fil) |
| `Échap` | Annuler le câblage en cours / désélectionner |
| `Ctrl` (pendant le glissement d'une poignée) | Réticule + alignement H/V du coude |
| `Entrée` (champ série) | Envoyer la ligne au microcontrôleur |
