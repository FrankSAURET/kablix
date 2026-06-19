 <img src="Kablix.png" alt="Kablix" width="200" />

# Kablix
Une application gauloise de simulation de microcontrôleurs (**Arduino Uno / Raspberry Pi Pico**) directement dans VS Code, **100% offline**.

La simulation s'appuie sur deux moteurs open-source embarqués dans l'extension :
[avr8js](https://github.com/wokwi/avr8js) (ATmega328P) et
[rp2040js](https://github.com/wokwi/rp2040js) (RP2040), tous deux sous licence MIT.
Aucun service en ligne n'est requis.

## Fonctionnalités (v0.6.0)

- ✅ **Atelier visuel** : palette de composants, placement, **déplacement direct
  à la souris**, **rotation par pas de 45°** (touches `+` / `-`) et **câblage
  broche-à-broche** sur un canvas (composants SVG réalistes
  [@wokwi/elements](https://github.com/wokwi/wokwi-elements), MIT)
- ✅ **Câblage multi-points** : cliquez une broche, posez des coudes en cliquant
  le fond (segments aimantés horizontal/vertical, **arrondi à chaque changement
  de direction**), terminez sur une broche — Échap annule
- ✅ **Retouche des fils** : sélectionnez un fil pour faire apparaître les
  **poignées de saisie** sur chaque coude (double-clic sur le fil pour en
  ajouter) ; maintenez **Ctrl** pendant le glissement pour afficher un
  **réticule H/V** et forcer les segments à l'horizontale/verticale
- ✅ **Couleurs de fils Dupont** : les 10 couleurs des nappes arc-en-ciel,
  attribuées en rotation aux nouveaux fils et modifiables d'un clic
- ✅ **Éditeur de composants** : panneau « Propriétés » — sélectionnez un
  composant (couleur de LED, valeur et angle de résistance, couleur de bouton,
  position du potentiomètre…) ou un fil (couleur, suppression) ; touche Suppr
- ✅ **Créateur de composants** : bouton « + Créer un composant » — nom, dessin
  SVG, points de connexion posés en cliquant l'aperçu, et modèle de simulation
  (LED, bouton, résistance, buzzer, source numérique/analogique, décoratif)
  avec correspondance des rôles de broches ; persistés entre les sessions
- ✅ **Export SVG** : bouton « ⬇ SVG » — schéma complet (composants, rotations,
  fils colorés) exporté en fichier SVG autonome
- ✅ **Bibliothèque étendue** : afficheur 7 segments, barre de 10 LED,
  interrupteur à glissière, DIP switch ×8, joystick analogique, potentiomètre
  à glissière, photorésistance (LDR), détecteur de mouvement PIR, capteur
  d'inclinaison, servomoteur — tous pilotés par la netlist
- ✅ **Carte Raspberry Pi Pico** : élément SVG maison (`<kablix-pico-board>`)
  avec les 40 broches colorées (GP = or, GND = gris, alimentation = rouge),
  la **LED embarquée GP25** qui clignote visuellement, le connecteur USB et le
  chip RP2040 — plus une pastille GP25 câblable
- ✅ **Composants** : Arduino Uno, Raspberry Pi Pico, LED, **LED RGB**, bouton
  poussoir, résistance, **buzzer** (note animée quand actif), **potentiomètre**
  (entrée analogique interactive : A0–A5 sur Uno, GP26–GP28 sur Pico), reliés
  par une **netlist** qui pilote la simulation
- ✅ **Sélecteur de carte** Arduino Uno / Raspberry Pi Pico dans la barre
  d'outils, avec schéma de démarrage automatique pour chaque carte
  (Uno : LED D13 + bouton D2 ; Pico : LED GP25 + bouton GP13)
- ✅ **Flash RP2040 réel** : parseur **UF2** intégré, bootrom B1 embarqué,
  firmware programmé en flash et démarré comme sur la vraie carte
  (compatible pico-sdk) ; **USB-CDC et UART0** reliés au moniteur série
- ✅ **MicroPython** : ouvrez un fichier `.py`, Kablix **télécharge le firmware
  au besoin** (proposition automatique Pico / Pico W, mémorisé entre projets) —
  ou utilise celui du workspace / du réglage `kablix.micropythonUf2` — et
  **exécute votre script** via le raw REPL : `print()` et le REPL interactif
  fonctionnent dans le moniteur série
- ✅ **Chargement direct d'artefacts** : `.hex` (Uno), `.uf2` / `.elf` / `.bin`
  (Pico) ; bouton **↑ Charger workspace** et commande « Kablix : Charger
  l'artefact compilé du workspace » (détection du `.hex` le plus récent via
  `.vscode/arduino.json` ou scan, et du `.uf2` dans `build/` pour
  pico-vscode/cmake)
- ✅ **Compilation du code réel** : compile le fichier C/C++ actif avec une
  toolchain locale (`arduino-cli` ou `avr-gcc` pour l'AVR, `arm-none-eabi-gcc`
  pour le RP2040) puis l'exécute dans le simulateur
- ✅ **Moniteur série bidirectionnel** : sortie temps réel + champ d'envoi vers
  le microcontrôleur (USART Uno, USB-CDC/UART0 Pico — utilisable comme REPL
  MicroPython)
- ✅ **Empaquetage `.vsix`** prêt à installer

Tout le pipeline (netlist → émulateur → affichage, parseurs UF2/ELF, exécution
MicroPython de bout en bout) est couvert par des tests automatisés.

> 📖 **Guide complet** : [docs/UTILISATION.md](docs/UTILISATION.md) (français) /
> [docs/USAGE.en.md](docs/USAGE.en.md) (English) — interface, câblage, création
> de composants personnalisés (avec prompt IA), format `.kablix-part.json`,
> sources de composants existants.
>
> 🌍 **Interface bilingue** : français si VS Code est en français, anglais sinon.
> Le mécanisme est extensible à d'autres langues — voir [Internationalisation](#internationalisation).

## Utilisation

1. Palette de commandes (`Ctrl+Shift+P`) → **« Kablix : Ouvrir le simulateur »**.
2. Choisir la carte (**Arduino Uno** ou **Raspberry Pi Pico**) dans la barre
   d'outils : un schéma de démarrage est posé sur le canvas. Cliquer
   **▶ Démarrer** : la LED clignote, le bouton est interactif, la série s'affiche.
3. **Construire son montage** : cliquer un composant de la palette pour le poser,
   le déplacer par son bandeau, et **relier deux broches** en cliquant
   successivement sur leurs pastilles. Cliquer un fil pour le supprimer.
4. **Exécuter son propre code** : ouvrir un fichier (voir `examples/`) puis
   **« ⚙ Compiler & exécuter le fichier actif »** :
   - `.ino` / `.c` / `.cpp` → compilation via la toolchain locale ;
   - `.py` → MicroPython sur le Pico simulé (firmware `.uf2` requis, voir
     ci-dessous) ;
   - `.hex` / `.uf2` / `.elf` / `.bin` → chargé directement sans compilation.
5. **Récupérer la sortie d'un autre outil** : bouton **↑ Charger workspace**
   (ou commande « Kablix : Charger l'artefact compilé du workspace ») pour
   lancer le dernier `.hex` (Arduino) ou `.uf2` (`build/`, pico-sdk/cmake).

### MicroPython sur le Pico simulé

1. Ouvrir un fichier `.py` puis « ⚙ Compiler & exécuter le fichier actif » :
   le script est injecté via le raw REPL au démarrage du firmware. Le champ du
   moniteur série permet ensuite de dialoguer avec le REPL.
2. **Firmware** : au premier lancement, si aucun firmware n'est trouvé, Kablix
   **propose de le télécharger automatiquement** (choix Pico / Pico W) depuis
   [micropython.org](https://micropython.org/download/RPI_PICO/). Il est ensuite
   mémorisé et réutilisé dans tous les projets.
3. Pour fournir le vôtre : placez un `.uf2` officiel dans le workspace **ou**
   renseignez son chemin dans le réglage **`kablix.micropythonUf2`** (prioritaire).

### Toolchains requises pour compiler votre code C/C++

| Carte | Compilateurs reconnus |
| --- | --- |
| Arduino Uno | `arduino-cli` (sketch Arduino complet) **ou** `avr-gcc` + `avr-objcopy` (C/C++ avr-libc) |
| Raspberry Pi Pico | `arm-none-eabi-gcc` + `arm-none-eabi-objcopy` (bare-metal RAM, voir `examples/blink_pico.c`) — ou tout projet **pico-sdk** : compilez avec cmake puis « ↑ Charger workspace » |

## Développement

```bash
npm install              # dépendances
npm run build            # compile extension + webview dans dist/
npm run watch            # recompilation continue
npm run typecheck        # vérification des types (tsc)
npm run build:firmware   # recompile les démos embarquées (nécessite les toolchains)
npm run verify:all       # moteurs + netlist + parseurs UF2/ELF (+ compilation si toolchains)
npm run verify:micropython # test bout en bout MicroPython (firmware dans test-assets/)
npm run package          # génère le .vsix
```

Dans VS Code, **F5** (« Lancer l'extension ») ouvre une fenêtre de développement.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `src/extension.ts` | Point d'entrée : commandes |
| `src/panel.ts` | Panneau webview (HTML, CSP, messagerie, artefacts workspace) |
| `src/help.ts` | Page d'aide locale (hors-ligne) — registre de langues (cf. *Internationalisation*) |
| `src/webview/i18n.mts` | Traduction des chaînes de la webview (dictionnaire clé → traduction) |
| `src/compiler.ts` | Toolchains + compilation + chargement d'artefacts (hôte) |
| `src/shared/uf2.ts` | Parseur UF2 (blocs → segments flash) |
| `src/shared/elf.ts` | Parseur ELF32 minimal (PT_LOAD) |
| `src/webview/sim.mts` | Contrôleur : atelier + simulation + série |
| `src/webview/diagram/catalog.mts` | Catalogue de composants + rôles des broches Uno/Pico |
| `src/webview/diagram/model.mts` | Netlist (pure) + résolution LED/RGB/buzzer/bouton/potentiomètre |
| `src/webview/diagram/editor.mts` | Éditeur DOM : palette, placement, câblage |
| `src/webview/elements/pico-board.mts` | Élément SVG maison `<kablix-pico-board>` |
| `src/webview/engines/avr.mts` | Moteur ATmega328P (avr8js) : GPIO, ADC, USART |
| `src/webview/engines/pico.mts` | Moteur RP2040 (rp2040js) : RAM/flash, bootrom, USB-CDC, UART0, raw REPL |
| `src/webview/engines/bootrom-b1.mts` | Bootrom B1 du RP2040 (binaire officiel, BSD-3-Clause) |
| `src/webview/programs/*.mjs` | Firmwares de démo compilés (générés) |
| `firmware/` | Sources C des démos + linker RP2040 |
| `scripts/verify-*.mjs` | Tests automatisés (moteurs, netlist, parseurs, compilation, MicroPython) |

## Internationalisation

L'interface suit la langue de VS Code (`vscode.env.language`) : **français si elle
commence par `fr`, anglais sinon** (langue de repli). La traduction repose sur deux
registres indépendants, parce qu'ils traduisent des choses de nature différente :

| Quoi | Fichier | Forme |
| --- | --- | --- |
| Chaînes de la webview (barre d'outils, palette, inspecteur, catalogue…) | `src/webview/i18n.mts` | dictionnaire **clé (anglais) → traduction** (`DICTS`) ; `t()` retombe sur la clé anglaise si absente |
| Page d'aide (`kablix.openHelp`) | `src/help.ts` | registre de **documents HTML complets** par langue (`HELP_LOCALES`) ; repli sur l'anglais |

Les deux utilisent la même résolution : le **code base** de la langue (`fr-FR` → `fr`)
sélectionne l'entrée correspondante, et l'anglais sert de repli quand elle est absente.

### Ajouter une langue (ex. allemand, `de`)

À faire aux **deux** registres — une langue déclarée à un seul endroit ne sera traduite
qu'à moitié :

1. **Webview** — dans [`src/webview/i18n.mts`](src/webview/i18n.mts) : créer le
   dictionnaire `const DE = { … }` (mêmes clés anglaises que `FR`) puis l'ajouter à
   `DICTS` → `{ fr: FR, de: DE }`. Les clés non traduites retombent automatiquement
   sur l'anglais.
2. **Aide** — dans [`src/help.ts`](src/help.ts) : écrire `bodyDe()` (copie traduite de
   `bodyFr`/`bodyEn`), ajouter l'URL de doc `DOC_URL_DE`, puis une entrée à
   `HELP_LOCALES` → `de: { lang: 'de', title: 'Kablix — Hilfe', docUrl: DOC_URL_DE, body: bodyDe }`.

Aucune autre modification de logique n'est nécessaire : la sélection et le repli sont
gérés par `initLocale()` (webview) et `resolveLocale()` (aide).

## Crédits

Kablix est développé par **[electropol.fr](https://electropol.fr)** et s'appuie sur les bibliothèques open-source suivantes :

| Bibliothèque | Rôle | Licence |
| --- | --- | --- |
| [avr8js](https://github.com/wokwi/avr8js) | Moteur de simulation ATmega328P (Arduino Uno) | MIT |
| [rp2040js](https://github.com/wokwi/rp2040js) | Moteur de simulation RP2040 (Raspberry Pi Pico) | MIT |
| [@wokwi/elements](https://github.com/wokwi/wokwi-elements) | Composants visuels (cartes, LED, capteurs…) | MIT |
| [JSZip](https://stuk.github.io/jszip/) | Lecture/écriture des archives `.projix` | MIT / GPLv3 |
| Bootrom B1 du RP2040 | Démarrage du RP2040 simulé | © Raspberry Pi (Trading) Ltd — BSD-3-Clause |
| MicroPython | Firmware `.uf2` exécuté sur le Pico simulé (fourni par l'utilisateur) | MIT |

Le format de projet et les composants importés sont compatibles avec [Wokwi](https://wokwi.com) (format ouvert `diagram.json`).

## Licence

MIT — le bootrom RP2040 embarqué est © Raspberry Pi (Trading) Ltd, licence BSD-3-Clause.
